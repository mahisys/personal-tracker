import "server-only";
import { desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { bills, borrowers, companies, contacts, invoices, leads, lenders, loanFiles, projects, quotes, tasks, transactions, type WorkspaceKey } from "@/db/schema";
import { formatDay } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export type SearchGroupKey = "leads" | "contacts" | "companies" | "borrowers" | "files" | "invoices" | "quotes" | "tasks" | "projects" | "transactions" | "bills";

export type SearchItem = { id: string; title: string; subtitle: string; href: string; workspace: WorkspaceKey | null };
export type SearchGroup = { key: SearchGroupKey; label: string; items: SearchItem[] };

/** Escapes LIKE wildcards so "50%" or "a_b" match literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Normalises a query: trims, collapses spaces, caps length. Returns null when too short. */
export function normaliseQuery(q: string | null | undefined): string | null {
  const s = (q ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return s.length >= 2 ? s : null;
}

const PER_GROUP = 6;

export async function searchAll(raw: string): Promise<{ q: string; groups: SearchGroup[]; total: number } | null> {
  const q = normaliseQuery(raw);
  if (!q) return null;
  const pat = `%${escapeLike(q)}%`;
  const like = (col: AnyPgColumn | SQL) => ilike(col as AnyPgColumn, pat);
  const digits = q.replace(/\D/g, "");
  const phoneLike = (col: AnyPgColumn) =>
    digits.length >= 4 ? sql`regexp_replace(coalesce(${col}, ''), '\\D', '', 'g') like ${`%${digits}%`}` : sql`false`;

  const [leadRows, contactRows, companyRows, borrowerRows, fileRows, invoiceRows, quoteRows, taskRows, projectRows, txnRows, billRows] = await Promise.all([
    db.select({ id: leads.id, title: leads.title, workspace: leads.workspace, value: leads.valuePaise }).from(leads).where(like(leads.title)).orderBy(desc(leads.updatedAt)).limit(PER_GROUP),
    db
      .select({ id: contacts.id, name: contacts.name, phone: contacts.phone, email: contacts.email, workspace: contacts.workspace })
      .from(contacts)
      .where(or(like(contacts.name), like(contacts.email), like(contacts.phone), phoneLike(contacts.phone), phoneLike(contacts.whatsapp)))
      .orderBy(desc(contacts.updatedAt))
      .limit(PER_GROUP),
    db
      .select({ id: companies.id, name: companies.name, gstin: companies.gstin, city: companies.city, workspace: companies.workspace })
      .from(companies)
      .where(or(like(companies.name), like(companies.gstin)))
      .orderBy(desc(companies.updatedAt))
      .limit(PER_GROUP),
    db
      .select({ id: borrowers.id, name: borrowers.name, phone: borrowers.phone, city: borrowers.city })
      .from(borrowers)
      .where(or(like(borrowers.name), like(borrowers.phone), phoneLike(borrowers.phone)))
      .orderBy(desc(borrowers.updatedAt))
      .limit(PER_GROUP),
    db
      .select({ id: loanFiles.id, applicationNo: loanFiles.applicationNo, stage: loanFiles.stage, product: loanFiles.product, borrower: borrowers.name, lender: lenders.name })
      .from(loanFiles)
      .innerJoin(borrowers, eq(loanFiles.borrowerId, borrowers.id))
      .leftJoin(lenders, eq(loanFiles.lenderId, lenders.id))
      .where(like(loanFiles.applicationNo))
      .orderBy(desc(loanFiles.updatedAt))
      .limit(PER_GROUP),
    db
      .select({ id: invoices.id, number: invoices.number, billTo: invoices.billTo, total: invoices.totalPaise, status: invoices.status, workspace: invoices.workspace, issueDate: invoices.issueDate })
      .from(invoices)
      .where(or(like(invoices.number), like(sql`${invoices.billTo}->>'name'`)))
      .orderBy(desc(invoices.issueDate))
      .limit(PER_GROUP),
    db
      .select({ id: quotes.id, number: quotes.number, total: quotes.totalPaise, status: quotes.status, workspace: quotes.workspace })
      .from(quotes)
      .where(like(quotes.number))
      .orderBy(desc(quotes.issueDate))
      .limit(PER_GROUP),
    db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate, workspace: tasks.workspace })
      .from(tasks)
      .where(like(tasks.title))
      .orderBy(sql`case when ${tasks.status} in ('done','cancelled') then 1 else 0 end`, desc(tasks.updatedAt))
      .limit(PER_GROUP),
    db.select({ id: projects.id, name: projects.name, status: projects.status, workspace: projects.workspace }).from(projects).where(like(projects.name)).orderBy(desc(projects.updatedAt)).limit(PER_GROUP),
    db
      .select({ id: transactions.id, party: transactions.party, description: transactions.description, type: transactions.type, amount: transactions.amountPaise, date: transactions.date, workspace: transactions.workspace })
      .from(transactions)
      .where(or(like(transactions.party), like(transactions.description)))
      .orderBy(desc(transactions.date))
      .limit(PER_GROUP),
    db
      .select({ id: bills.id, title: bills.title, payee: bills.payee, amount: bills.amountPaise, dueDate: bills.dueDate, status: bills.status, workspace: bills.workspace })
      .from(bills)
      .where(or(like(bills.title), like(bills.payee)))
      .orderBy(desc(bills.dueDate))
      .limit(PER_GROUP),
  ]);

  const pretty = (s: string) => s.replace(/_/g, " ");
  const all: SearchGroup[] = [
    { key: "leads", label: "Leads", items: leadRows.map((r) => ({ id: r.id, title: r.title, subtitle: r.value ? formatINR(r.value, { whole: true }) : "Lead", href: `/crm/leads/${r.id}`, workspace: r.workspace })) },
    { key: "contacts", label: "Contacts", items: contactRows.map((r) => ({ id: r.id, title: r.name, subtitle: [r.phone, r.email].filter(Boolean).join(" · ") || "Contact", href: `/crm/contacts/${r.id}`, workspace: r.workspace })) },
    { key: "companies", label: "Companies", items: companyRows.map((r) => ({ id: r.id, title: r.name, subtitle: [r.gstin, r.city].filter(Boolean).join(" · ") || "Company", href: `/crm/companies/${r.id}`, workspace: r.workspace })) },
    { key: "borrowers", label: "Borrowers", items: borrowerRows.map((r) => ({ id: r.id, title: r.name, subtitle: [r.phone, r.city].filter(Boolean).join(" · ") || "Borrower", href: `/dsa/borrowers/${r.id}`, workspace: "dsa" as const })) },
    {
      key: "files",
      label: "Loan files",
      items: fileRows.map((r) => ({ id: r.id, title: `${r.applicationNo} · ${r.borrower}`, subtitle: [pretty(r.product), r.lender, pretty(r.stage)].filter(Boolean).join(" · "), href: `/dsa/files/${r.id}`, workspace: "dsa" as const })),
    },
    {
      key: "invoices",
      label: "Invoices",
      items: invoiceRows.map((r) => ({ id: r.id, title: `${r.number} · ${r.billTo?.name ?? ""}`, subtitle: `${formatINR(r.total, { whole: true })} · ${pretty(r.status)} · ${formatDay(r.issueDate, { short: true })}`, href: `/invoices/${r.id}`, workspace: r.workspace })),
    },
    { key: "quotes", label: "Quotes", items: quoteRows.map((r) => ({ id: r.id, title: r.number, subtitle: `${formatINR(r.total, { whole: true })} · ${r.status}`, href: `/sales/quotes/${r.id}`, workspace: r.workspace })) },
    { key: "tasks", label: "Tasks", items: taskRows.map((r) => ({ id: r.id, title: r.title, subtitle: [pretty(r.status), r.dueDate ? `due ${formatDay(r.dueDate, { short: true })}` : null].filter(Boolean).join(" · "), href: `/tasks/${r.id}`, workspace: r.workspace })) },
    { key: "projects", label: "Projects", items: projectRows.map((r) => ({ id: r.id, title: r.name, subtitle: pretty(r.status), href: `/projects/${r.id}`, workspace: r.workspace })) },
    {
      key: "transactions",
      label: "Transactions",
      items: txnRows.map((r) => ({
        id: r.id,
        title: r.party || r.description || "Transaction",
        subtitle: `${r.type === "income" ? "+" : r.type === "expense" ? "−" : "⇄ "}${formatINR(r.amount, { whole: true })} · ${formatDay(r.date, { short: true })}${r.party && r.description ? ` · ${r.description}` : ""}`,
        href: `/books/transactions?q=${encodeURIComponent(q)}`,
        workspace: r.workspace,
      })),
    },
    { key: "bills", label: "Bills & payments", items: billRows.map((r) => ({ id: r.id, title: r.title, subtitle: `${formatINR(r.amount, { whole: true })}${r.payee ? ` to ${r.payee}` : ""} · ${r.status === "upcoming" ? `due ${formatDay(r.dueDate, { short: true })}` : r.status}`, href: `/planner/bills/${r.id}`, workspace: r.workspace })) },
  ];
  const groups = all.filter((g) => g.items.length);

  return { q, groups, total: groups.reduce((s, g) => s + g.items.length, 0) };
}
