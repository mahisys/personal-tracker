import "server-only";
import { and, eq, gte, inArray, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { categories, invoices, projects, tasks, timeEntries, transactions, type WorkspaceKey } from "@/db/schema";
import { addDays, endOfMonth, istToInstant, startOfMonth, toISTDate } from "@/lib/dates";
import {
  budgetVsActual,
  estimateAccuracy,
  expensesByCategory,
  fyMonths,
  fyRange,
  gstSummary,
  mondayOf,
  profitAndLoss,
  receivablesAgeing,
  timeReport,
} from "./aggregate";

const wsCond = (col: AnyPgColumn, ws: WorkspaceKey | null) => (ws ? eq(col, ws) : undefined);

export async function getPnl(startYear: number, ws: WorkspaceKey | null) {
  const { start, end } = fyRange(startYear);
  const rows = await db
    .select({ date: transactions.date, workspace: transactions.workspace, type: transactions.type, amountPaise: transactions.amountPaise })
    .from(transactions)
    .where(and(gte(transactions.date, start), lte(transactions.date, end), wsCond(transactions.workspace, ws)));
  return profitAndLoss(rows, startYear);
}

/** Expenses for a period: a month ("YYYY-MM") or a whole FY. */
export async function getExpensesByCategory(period: { from: string; to: string }, ws: WorkspaceKey | null) {
  const rows = await db
    .select({ categoryId: transactions.categoryId, categoryName: categories.name, amountPaise: sql<number>`sum(${transactions.amountPaise})::bigint` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.type, "expense"), gte(transactions.date, period.from), lte(transactions.date, period.to), wsCond(transactions.workspace, ws)))
    .groupBy(transactions.categoryId, categories.name);
  return expensesByCategory(rows.map((r) => ({ ...r, amountPaise: Number(r.amountPaise) })));
}

export async function getReceivables(today: string, ws: WorkspaceKey | null) {
  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      billTo: invoices.billTo,
      companyId: invoices.companyId,
      dueDate: invoices.dueDate,
      totalPaise: invoices.totalPaise,
      paidPaise: invoices.paidPaise,
    })
    .from(invoices)
    .where(and(inArray(invoices.status, ["sent", "part_paid"]), wsCond(invoices.workspace, ws)));
  const list = rows.map((r) => ({
    id: r.id,
    number: r.number,
    client: r.billTo?.name || "Unknown client",
    clientKey: r.companyId ?? `name:${(r.billTo?.name ?? "").toLowerCase()}`,
    companyId: r.companyId,
    dueDate: r.dueDate,
    totalPaise: r.totalPaise,
    paidPaise: r.paidPaise,
  }));
  return { ...receivablesAgeing(list, today), invoices: list.filter((i) => i.totalPaise > i.paidPaise).sort((a, b) => a.dueDate.localeCompare(b.dueDate)) };
}

export async function getGstSummary(startYear: number, ws: WorkspaceKey | null) {
  const { start, end } = fyRange(startYear);
  const inv = await db
    .select({ issueDate: invoices.issueDate, subtotalPaise: invoices.subtotalPaise, cgstPaise: invoices.cgstPaise, sgstPaise: invoices.sgstPaise, igstPaise: invoices.igstPaise })
    .from(invoices)
    .where(and(gte(invoices.issueDate, start), lte(invoices.issueDate, end), notInArray(invoices.status, ["draft", "cancelled"]), wsCond(invoices.workspace, ws)));
  const exp = await db
    .select({ date: transactions.date, gstPaise: transactions.gstPaise })
    .from(transactions)
    .where(and(eq(transactions.type, "expense"), gte(transactions.date, start), lte(transactions.date, end), sql`${transactions.gstPaise} > 0`, wsCond(transactions.workspace, ws)));
  return gstSummary(inv, exp, fyMonths(startYear));
}

/** Budget vs actual for a month ("YYYY-MM"). */
export async function getBudget(month: string, ws: WorkspaceKey | null) {
  const from = startOfMonth(`${month}-01`);
  const to = endOfMonth(from);
  const cats = await db
    .select({ id: categories.id, name: categories.name, monthlyBudgetPaise: categories.monthlyBudgetPaise, workspace: categories.workspace })
    .from(categories)
    .where(and(eq(categories.kind, "expense"), eq(categories.archived, false)));
  const actual = await db
    .select({ categoryId: transactions.categoryId, total: sql<number>`sum(${transactions.amountPaise})::bigint` })
    .from(transactions)
    .where(and(eq(transactions.type, "expense"), gte(transactions.date, from), lte(transactions.date, to), isNotNull(transactions.categoryId), wsCond(transactions.workspace, ws)))
    .groupBy(transactions.categoryId);
  const map = new Map(actual.map((a) => [a.categoryId!, Number(a.total)]));
  const scoped = cats.filter((c) => !ws || c.workspace == null || c.workspace === ws);
  const unbudgeted = scoped.filter((c) => !c.monthlyBudgetPaise && (map.get(c.id) ?? 0) > 0).map((c) => ({ id: c.id, name: c.name, actualPaise: map.get(c.id)! }));
  return { lines: budgetVsActual(scoped, map), unbudgeted: unbudgeted.sort((a, b) => b.actualPaise - a.actualPaise), from, to };
}

export async function getTimeReport(weeks: number, today: string, ws: WorkspaceKey | null) {
  const from = addDays(mondayOf(today), -7 * (weeks - 1));
  const rows = await db
    .select({ startedAt: timeEntries.startedAt, minutes: timeEntries.minutes, workspace: tasks.workspace, projectId: tasks.projectId, projectName: projects.name })
    .from(timeEntries)
    .innerJoin(tasks, eq(timeEntries.taskId, tasks.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(gte(timeEntries.startedAt, istToInstant(from)), wsCond(tasks.workspace, ws)));
  return timeReport(rows, weeks, today, toISTDate);
}

export async function getEstimateAccuracy(ws: WorkspaceKey | null, sinceDays = 180) {
  const since = istToInstant(addDays(toISTDate(new Date()), -sinceDays));
  const rows = await db
    .select({
      taskType: tasks.taskType,
      estimateMinutes: tasks.estimateMinutes,
      actualMinutes: sql<number>`coalesce((select sum(${timeEntries.minutes}) from ${timeEntries} where ${timeEntries.taskId} = ${tasks.id}), 0)::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.status, "done"), isNotNull(tasks.estimateMinutes), gte(tasks.completedAt, since), wsCond(tasks.workspace, ws)));
  return estimateAccuracy(rows.map((r) => ({ taskType: r.taskType, estimateMinutes: r.estimateMinutes ?? 0, actualMinutes: Number(r.actualMinutes) })));
}

/** Financial years that have any transactions or invoices (always includes the current one). */
export async function getAvailableFys(currentStartYear: number): Promise<number[]> {
  const [r] = await db.select({ min: sql<string | null>`min(${transactions.date})` }).from(transactions);
  const [i] = await db.select({ min: sql<string | null>`min(${invoices.issueDate})` }).from(invoices);
  const mins = [r?.min, i?.min].filter(Boolean).map((d) => String(d));
  const earliest = mins.length ? mins.sort()[0] : null;
  let first = currentStartYear;
  if (earliest) {
    const y = Number(earliest.slice(0, 4));
    first = Number(earliest.slice(5, 7)) >= 4 ? y : y - 1;
  }
  const out: number[] = [];
  for (let y = currentStartYear; y >= Math.max(first, currentStartYear - 10); y--) out.push(y);
  return out;
}
