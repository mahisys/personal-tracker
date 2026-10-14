import "server-only";
import { and, asc, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, contacts, invoicePayments, invoices, leadStages, leads, quotes, salesTargets, type WorkspaceKey } from "@/db/schema";
import { addDays, endOfMonth, formatMonth, istToInstant, monthKey, startOfMonth, todayIST } from "@/lib/dates";
import { stagesFor } from "@/server/crm/core";
import { weightedValue } from "@/server/crm/pipeline";
import { getLineItems } from "@/server/invoices/core";
import { averageDaysToClose, bucketByMonth, lastMonths, winRate } from "./metrics";

export async function getSalesDashboard(filter: WorkspaceKey | null) {
  const ws = filter ?? "mahisys";
  const today = todayIST();
  const month = monthKey(today);
  const months = lastMonths(today, 12);
  const firstDay = `${months[0]}-01`;
  const { stages } = await stagesFor(db, ws);
  const stageIds = stages.map((s) => s.id);
  const kindOf = new Map(stages.map((s) => [s.id, s.kind]));

  const [targetRows, invoiceRows, paymentRows, leadRows] = await Promise.all([
    db.select().from(salesTargets).where(eq(salesTargets.workspace, ws)).orderBy(desc(salesTargets.month)),
    db
      .select({ issueDate: invoices.issueDate, totalPaise: invoices.totalPaise, subtotalPaise: invoices.subtotalPaise })
      .from(invoices)
      .where(and(eq(invoices.workspace, ws), notInArray(invoices.status, ["draft", "cancelled"]), gte(invoices.issueDate, firstDay))),
    db
      .select({ date: invoicePayments.date, amountPaise: invoicePayments.amountPaise, tdsPaise: invoicePayments.tdsPaise })
      .from(invoicePayments)
      .innerJoin(invoices, eq(invoices.id, invoicePayments.invoiceId))
      .where(and(eq(invoices.workspace, ws), gte(invoicePayments.date, firstDay))),
    stageIds.length ? db.select().from(leads).where(and(eq(leads.workspace, ws), inArray(leads.stageId, stageIds))) : [],
  ]);

  const revenueByMonth = bucketByMonth(months, invoiceRows.map((r) => ({ day: r.issueDate, paise: r.totalPaise })));
  const collectedByMonth = bucketByMonth(months, paymentRows.map((r) => ({ day: r.date, paise: r.amountPaise + r.tdsPaise })));
  const revenueThisMonth = revenueByMonth[revenueByMonth.length - 1];
  const target = targetRows.find((t) => t.month === month) ?? null;

  const open = leadRows.filter((l) => kindOf.get(l.stageId) === "open");
  const byStage = stages
    .filter((s) => s.kind === "open")
    .map((s) => {
      const ls = open.filter((l) => l.stageId === s.id);
      return { id: s.id, name: s.name, count: ls.length, valuePaise: ls.reduce((a, l) => a + l.valuePaise, 0), weightedPaise: weightedValue(ls) };
    });

  const cut = istToInstant(addDays(today, -90));
  const closed90 = leadRows.filter((l) => l.closedAt && l.closedAt >= cut);
  const won90 = closed90.filter((l) => kindOf.get(l.stageId) === "won").length;
  const lost90 = closed90.filter((l) => kindOf.get(l.stageId) === "lost").length;
  const wonAll = leadRows.filter((l) => kindOf.get(l.stageId) === "won");

  const sources = new Map<string, { source: string; leads: number; won: number; wonValue: number; pipeline: number }>();
  for (const l of leadRows) {
    const key = l.source?.trim() || "Unknown";
    const s = sources.get(key) ?? { source: key, leads: 0, won: 0, wonValue: 0, pipeline: 0 };
    s.leads++;
    if (kindOf.get(l.stageId) === "won") {
      s.won++;
      s.wonValue += l.valuePaise;
    } else if (kindOf.get(l.stageId) === "open") s.pipeline += l.valuePaise;
    sources.set(key, s);
  }

  return {
    ws,
    month,
    target,
    targets: targetRows,
    revenueThisMonth,
    chart: months.map((m, i) => ({ month: m, label: formatMonth(m).slice(0, 3), invoiced: revenueByMonth[i], collected: collectedByMonth[i] })),
    byStage,
    pipelineValue: open.reduce((s, l) => s + l.valuePaise, 0),
    weighted: weightedValue(open),
    openCount: open.length,
    winRate: winRate(won90, lost90),
    won90,
    lost90,
    avgDaysToClose: averageDaysToClose(wonAll),
    sources: [...sources.values()].sort((a, b) => b.wonValue - a.wonValue || b.leads - a.leads),
    monthStart: startOfMonth(today),
    monthEnd: endOfMonth(today),
  };
}

export async function listQuotes(filter: WorkspaceKey | null) {
  return db
    .select({ quote: quotes, companyName: companies.name, contactName: contacts.name, leadTitle: leads.title })
    .from(quotes)
    .leftJoin(companies, eq(companies.id, quotes.companyId))
    .leftJoin(contacts, eq(contacts.id, quotes.contactId))
    .leftJoin(leads, eq(leads.id, quotes.leadId))
    .where(filter ? eq(quotes.workspace, filter) : undefined)
    .orderBy(desc(quotes.issueDate), desc(quotes.number));
}

export async function getQuoteDetail(id: string) {
  const [row] = await db
    .select({ quote: quotes, company: companies, contact: contacts, leadTitle: leads.title })
    .from(quotes)
    .leftJoin(companies, eq(companies.id, quotes.companyId))
    .leftJoin(contacts, eq(contacts.id, quotes.contactId))
    .leftJoin(leads, eq(leads.id, quotes.leadId))
    .where(eq(quotes.id, id));
  if (!row) return null;
  const [items, invoice] = await Promise.all([
    getLineItems(db, "quote", id),
    row.quote.invoiceId ? db.select({ id: invoices.id, number: invoices.number }).from(invoices).where(eq(invoices.id, row.quote.invoiceId)).then((r) => r[0] ?? null) : null,
  ]);
  return { ...row, items, invoice };
}

export async function openLeadOptions() {
  return db
    .select({ id: leads.id, title: leads.title, companyId: leads.companyId, contactId: leads.contactId })
    .from(leads)
    .innerJoin(leadStages, eq(leadStages.id, leads.stageId))
    .where(sql`${leadStages.kind} <> 'lost'`)
    .orderBy(asc(leads.title));
}
