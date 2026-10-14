import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, companies, contacts, invoicePayments, invoices, projects, quotes, type WorkspaceKey } from "@/db/schema";
import { diffDays, endOfMonth, startOfMonth, todayIST } from "@/lib/dates";
import { getLineItems } from "./core";
import { balanceOf, deriveInvoiceStatus } from "./status";

export async function listInvoices(ws: WorkspaceKey | null) {
  const today = todayIST();
  const rows = await db
    .select()
    .from(invoices)
    .where(ws ? eq(invoices.workspace, ws) : undefined)
    .orderBy(desc(invoices.issueDate), desc(invoices.number));
  return rows.map((r) => ({ ...r, derived: deriveInvoiceStatus(r, today), balancePaise: balanceOf(r) }));
}
export type InvoiceListRow = Awaited<ReturnType<typeof listInvoices>>[number];

export async function invoiceStats(ws: WorkspaceKey | null, rows: InvoiceListRow[]) {
  const today = todayIST();
  const live = rows.filter((r) => r.derived !== "cancelled" && r.derived !== "draft");
  const outstanding = live.reduce((s, r) => s + r.balancePaise, 0);
  const overdueRows = live.filter((r) => r.derived === "overdue");
  const overdue = overdueRows.reduce((s, r) => s + r.balancePaise, 0);

  const wsCond = ws ? eq(invoices.workspace, ws) : undefined;
  const [{ collected }] = await db
    .select({ collected: sql<string>`coalesce(sum(${invoicePayments.amountPaise}), 0)` })
    .from(invoicePayments)
    .innerJoin(invoices, eq(invoices.id, invoicePayments.invoiceId))
    .where(and(wsCond, gte(invoicePayments.date, startOfMonth(today)), lte(invoicePayments.date, endOfMonth(today))));

  // Average days to pay: issue date → date of the payment that settled it, for paid invoices.
  const settled = await db
    .select({ issueDate: invoices.issueDate, lastPaid: sql<string>`max(${invoicePayments.date})` })
    .from(invoices)
    .innerJoin(invoicePayments, eq(invoicePayments.invoiceId, invoices.id))
    .where(and(wsCond, eq(invoices.status, "paid")))
    .groupBy(invoices.id, invoices.issueDate);
  const avgDaysToPay = settled.length
    ? Math.round(settled.reduce((s, r) => s + Math.max(0, diffDays(r.issueDate, String(r.lastPaid).slice(0, 10))), 0) / settled.length)
    : null;

  return { outstanding, overdue, overdueCount: overdueRows.length, collected: Number(collected), avgDaysToPay, unpaidCount: live.filter((r) => r.balancePaise > 0).length };
}

export async function getInvoiceDetail(id: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) return null;
  const [items, payments, company, contact, project, quote] = await Promise.all([
    getLineItems(db, "invoice", id),
    db
      .select({ p: invoicePayments, accountName: accounts.name })
      .from(invoicePayments)
      .leftJoin(accounts, eq(accounts.id, invoicePayments.accountId))
      .where(eq(invoicePayments.invoiceId, id))
      .orderBy(desc(invoicePayments.date), desc(invoicePayments.createdAt)),
    inv.companyId ? db.select().from(companies).where(eq(companies.id, inv.companyId)).then((r) => r[0] ?? null) : null,
    inv.contactId ? db.select().from(contacts).where(eq(contacts.id, inv.contactId)).then((r) => r[0] ?? null) : null,
    inv.projectId ? db.select().from(projects).where(eq(projects.id, inv.projectId)).then((r) => r[0] ?? null) : null,
    db.select({ id: quotes.id, number: quotes.number }).from(quotes).where(eq(quotes.invoiceId, id)).then((r) => r[0] ?? null),
  ]);
  // Fall back to a contact at the client company for reminders.
  let reminderContact = contact;
  if (!reminderContact && inv.companyId) {
    [reminderContact] = await db.select().from(contacts).where(eq(contacts.companyId, inv.companyId)).orderBy(asc(contacts.createdAt)).limit(1);
  }
  const today = todayIST();
  return {
    invoice: inv,
    derived: deriveInvoiceStatus(inv, today),
    balancePaise: balanceOf(inv),
    items,
    payments: payments.map((r) => ({ ...r.p, accountName: r.accountName })),
    company,
    contact,
    reminderContact: reminderContact ?? null,
    project,
    quote,
  };
}

/** Options for the invoice/quote editor. */
export async function editorOptions() {
  const [companyRows, contactRows, projectRows] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name, gstin: companies.gstin, stateCode: companies.stateCode, address: companies.address, city: companies.city, email: companies.email, workspace: companies.workspace })
      .from(companies)
      .orderBy(asc(companies.name)),
    db.select({ id: contacts.id, name: contacts.name, companyId: contacts.companyId, email: contacts.email }).from(contacts).orderBy(asc(contacts.name)),
    db
      .select({ id: projects.id, name: projects.name, companyId: projects.companyId })
      .from(projects)
      .where(inArray(projects.status, ["planned", "active", "on_hold"]))
      .orderBy(asc(projects.name)),
  ]);
  return { companies: companyRows, contacts: contactRows, projects: projectRows };
}

export async function paymentAccounts() {
  return db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type, workspace: accounts.workspace })
    .from(accounts)
    .where(and(eq(accounts.archived, false), ne(accounts.type, "credit_card"), ne(accounts.type, "loan")))
    .orderBy(asc(accounts.name));
}
