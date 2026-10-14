import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, contacts, invoices, leadStages, leads, projects, quotes, tasks, type WorkspaceKey } from "@/db/schema";
import { istToInstant, startOfMonth, todayIST, toISTDate } from "@/lib/dates";
import { stagesFor } from "./core";
import { daysSince, followUpState, weightedValue } from "./pipeline";
import { balanceOf, deriveInvoiceStatus } from "@/server/invoices/status";

export type PipelineLead = {
  id: string;
  title: string;
  stageId: string;
  valuePaise: number;
  probability: number;
  companyName: string | null;
  contactName: string | null;
  nextFollowUpAt: string | null;
  followUp: ReturnType<typeof followUpState>;
  followUpDay: string | null;
  daysSinceActivity: number | null;
  source: string | null;
};

/** Everything the /crm page needs. */
export async function getPipeline(filter: WorkspaceKey | null) {
  const ws = filter ?? "mahisys";
  const { stages, workspace } = await stagesFor(db, ws);
  const today = todayIST();
  const stageIds = stages.map((s) => s.id);
  const rows = stageIds.length
    ? await db
        .select({
          lead: leads,
          companyName: companies.name,
          contactName: contacts.name,
        })
        .from(leads)
        .leftJoin(companies, eq(companies.id, leads.companyId))
        .leftJoin(contacts, eq(contacts.id, leads.contactId))
        .where(and(inArray(leads.stageId, stageIds), filter ? eq(leads.workspace, filter) : undefined))
        .orderBy(asc(leads.nextFollowUpAt), desc(leads.createdAt))
    : [];
  const kindOf = new Map(stages.map((s) => [s.id, s.kind]));
  const toCard = (r: (typeof rows)[number]): PipelineLead => ({
    id: r.lead.id,
    title: r.lead.title,
    stageId: r.lead.stageId,
    valuePaise: r.lead.valuePaise,
    probability: r.lead.probability,
    companyName: r.companyName,
    contactName: r.contactName,
    nextFollowUpAt: r.lead.nextFollowUpAt?.toISOString() ?? null,
    followUp: followUpState(r.lead.nextFollowUpAt, today),
    followUpDay: r.lead.nextFollowUpAt ? toISTDate(r.lead.nextFollowUpAt) : null,
    daysSinceActivity: daysSince(r.lead.lastActivityAt ?? r.lead.createdAt, today),
    source: r.lead.source,
  });
  const open = rows.filter((r) => kindOf.get(r.lead.stageId) === "open").map(toCard);
  const monthStart = istToInstant(startOfMonth(today));
  const wonThisMonth = rows.filter((r) => kindOf.get(r.lead.stageId) === "won" && r.lead.closedAt && r.lead.closedAt >= monthStart);
  // Recently closed leads, shown in won/lost columns (last 30 days) so the board feels alive.
  const recentCut = istToInstant(today).getTime() - 30 * 86_400_000;
  const closedRecent = rows
    .filter((r) => kindOf.get(r.lead.stageId) !== "open" && r.lead.closedAt && r.lead.closedAt.getTime() >= recentCut)
    .map(toCard);

  return {
    workspace,
    stages,
    leads: open,
    closedRecent,
    stats: {
      openValue: open.reduce((s, l) => s + l.valuePaise, 0),
      weighted: weightedValue(open),
      dueToday: open.filter((l) => l.followUp === "today" || l.followUp === "overdue").length,
      overdue: open.filter((l) => l.followUp === "overdue").length,
      wonThisMonthCount: wonThisMonth.length,
      wonThisMonthValue: wonThisMonth.reduce((s, r) => s + r.lead.valuePaise, 0),
    },
  };
}

export async function lookupOptions(ws: WorkspaceKey) {
  const [c, p] = await Promise.all([
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.workspace, ws)).orderBy(asc(companies.name)),
    db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone }).from(contacts).where(eq(contacts.workspace, ws)).orderBy(asc(contacts.name)),
  ]);
  return { companies: c, contacts: p };
}

export async function getLeadDetail(id: string) {
  const [row] = await db
    .select({ lead: leads, stage: leadStages })
    .from(leads)
    .innerJoin(leadStages, eq(leadStages.id, leads.stageId))
    .where(eq(leads.id, id));
  if (!row) return null;
  const { lead } = row;
  const [{ stages }, contact, company, acts, linkedTasks, leadQuotes, leadInvoices] = await Promise.all([
    stagesFor(db, row.stage.workspace),
    lead.contactId ? db.select().from(contacts).where(eq(contacts.id, lead.contactId)).then((r) => r[0] ?? null) : null,
    lead.companyId ? db.select().from(companies).where(eq(companies.id, lead.companyId)).then((r) => r[0] ?? null) : null,
    db.select().from(activities).where(eq(activities.leadId, id)).orderBy(desc(activities.at)),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.linkedType, "lead"), eq(tasks.linkedId, id)))
      .orderBy(sql`case when ${tasks.status} in ('done','cancelled') then 1 else 0 end`, asc(tasks.dueDate)),
    db.select().from(quotes).where(eq(quotes.leadId, id)).orderBy(desc(quotes.createdAt)),
    db.select().from(invoices).where(eq(invoices.leadId, id)).orderBy(desc(invoices.createdAt)),
  ]);
  const today = todayIST();
  return {
    lead,
    stage: row.stage,
    stages,
    contact,
    company,
    activities: acts,
    tasks: linkedTasks,
    quotes: leadQuotes,
    invoices: leadInvoices.map((i) => ({ ...i, derived: deriveInvoiceStatus(i, today), balancePaise: balanceOf(i) })),
  };
}

function like(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listContacts(filter: WorkspaceKey | null, q: string | null) {
  const openLeads = db
    .select({ contactId: leads.contactId, n: count().as("n") })
    .from(leads)
    .innerJoin(leadStages, eq(leadStages.id, leads.stageId))
    .where(eq(leadStages.kind, "open"))
    .groupBy(leads.contactId)
    .as("ol");
  return db
    .select({ contact: contacts, companyName: companies.name, openLeads: openLeads.n })
    .from(contacts)
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .leftJoin(openLeads, eq(openLeads.contactId, contacts.id))
    .where(
      and(
        filter ? eq(contacts.workspace, filter) : undefined,
        q ? or(ilike(contacts.name, like(q)), ilike(contacts.phone, like(q)), ilike(contacts.email, like(q)), ilike(companies.name, like(q)), ilike(contacts.city, like(q))) : undefined,
      ),
    )
    .orderBy(asc(contacts.name));
}

export async function listCompanies(filter: WorkspaceKey | null, q: string | null) {
  const contactCounts = db.select({ companyId: contacts.companyId, n: count().as("cn") }).from(contacts).groupBy(contacts.companyId).as("cc");
  const billed = db
    .select({ companyId: invoices.companyId, total: sql<string>`sum(${invoices.totalPaise})`.as("billed") })
    .from(invoices)
    .where(sql`${invoices.status} not in ('draft','cancelled')`)
    .groupBy(invoices.companyId)
    .as("bi");
  return db
    .select({ company: companies, contactCount: contactCounts.n, billed: billed.total })
    .from(companies)
    .leftJoin(contactCounts, eq(contactCounts.companyId, companies.id))
    .leftJoin(billed, eq(billed.companyId, companies.id))
    .where(
      and(
        filter ? eq(companies.workspace, filter) : undefined,
        q ? or(ilike(companies.name, like(q)), ilike(companies.gstin, like(q)), ilike(companies.city, like(q)), ilike(companies.industry, like(q))) : undefined,
      ),
    )
    .orderBy(asc(companies.name));
}

async function leadsWhere(cond: SQL) {
  return db
    .select({ lead: leads, stageName: leadStages.name, stageKind: leadStages.kind })
    .from(leads)
    .innerJoin(leadStages, eq(leadStages.id, leads.stageId))
    .where(cond)
    .orderBy(desc(leads.createdAt));
}

function invoicesWithStatus(rows: (typeof invoices.$inferSelect)[]) {
  const today = todayIST();
  return rows.map((i) => ({ ...i, derived: deriveInvoiceStatus(i, today), balancePaise: balanceOf(i) }));
}

export async function getContactDetail(id: string) {
  const [row] = await db.select({ contact: contacts, company: companies }).from(contacts).leftJoin(companies, eq(companies.id, contacts.companyId)).where(eq(contacts.id, id));
  if (!row) return null;
  const [contactLeads, acts, invs, projs] = await Promise.all([
    leadsWhere(eq(leads.contactId, id)),
    db.select().from(activities).where(eq(activities.contactId, id)).orderBy(desc(activities.at)).limit(30),
    db.select().from(invoices).where(eq(invoices.contactId, id)).orderBy(desc(invoices.issueDate)),
    row.contact.companyId ? db.select().from(projects).where(eq(projects.companyId, row.contact.companyId)).orderBy(desc(projects.createdAt)) : [],
  ]);
  return { contact: row.contact, company: row.company, leads: contactLeads, activities: acts, invoices: invoicesWithStatus(invs), projects: projs };
}

export async function getCompanyDetail(id: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) return null;
  const [people, companyLeads, acts, invs, projs] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.companyId, id)).orderBy(asc(contacts.name)),
    leadsWhere(eq(leads.companyId, id)),
    db.select().from(activities).where(eq(activities.companyId, id)).orderBy(desc(activities.at)).limit(30),
    db.select().from(invoices).where(eq(invoices.companyId, id)).orderBy(desc(invoices.issueDate)),
    db.select().from(projects).where(eq(projects.companyId, id)).orderBy(desc(projects.createdAt)),
  ]);
  return { company, contacts: people, leads: companyLeads, activities: acts, invoices: invoicesWithStatus(invs), projects: projs };
}

export async function listStages(ws: WorkspaceKey) {
  const rows = await db
    .select({ stage: leadStages, n: sql<number>`(select count(*)::int from ${leads} where ${leads.stageId} = ${leadStages.id})` })
    .from(leadStages)
    .where(eq(leadStages.workspace, ws))
    .orderBy(asc(leadStages.sort));
  return rows;
}
