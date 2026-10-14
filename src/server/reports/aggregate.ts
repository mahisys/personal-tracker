/**
 * Pure report aggregations (no DB). Loaders in ./queries.ts feed these plain rows.
 * All money in paise.
 */
import { WORKSPACE_KEYS, type WorkspaceKey } from "@/db/schema";
import { addDays, addMonths, diffDays } from "@/lib/dates";

// ---------------------------------------------------------------------------
// Financial year helpers
// ---------------------------------------------------------------------------

/** "YYYY-MM" keys April → March for the FY starting in startYear. */
export function fyMonths(startYear: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) out.push(addMonths(`${startYear}-04-01`, i).slice(0, 7));
  return out;
}

export function fyRange(startYear: number) {
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31`, label: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}` };
}

export function fyStartYear(day: string): number {
  const y = Number(day.slice(0, 4));
  return Number(day.slice(5, 7)) >= 4 ? y : y - 1;
}

// ---------------------------------------------------------------------------
// Profit & loss
// ---------------------------------------------------------------------------

export type TxnRow = { date: string; workspace: WorkspaceKey; type: "income" | "expense" | "transfer"; amountPaise: number };
type InOut = { income: number; expense: number; net: number };
export type PnlMonth = InOut & { month: string; byWorkspace: Record<WorkspaceKey, InOut> };
export type Pnl = { months: PnlMonth[]; total: InOut; byWorkspace: Record<WorkspaceKey, InOut> };

const zero = (): InOut => ({ income: 0, expense: 0, net: 0 });
const wsZero = () => Object.fromEntries(WORKSPACE_KEYS.map((k) => [k, zero()])) as Record<WorkspaceKey, InOut>;

/** Cash-basis P&L by month for a financial year. Transfers are ignored. */
export function profitAndLoss(rows: TxnRow[], startYear: number): Pnl {
  const months = fyMonths(startYear).map((month) => ({ month, ...zero(), byWorkspace: wsZero() }));
  const idx = new Map(months.map((m, i) => [m.month, i]));
  const total = zero();
  const byWorkspace = wsZero();
  for (const r of rows) {
    if (r.type === "transfer") continue;
    const i = idx.get(r.date.slice(0, 7));
    if (i == null) continue;
    const m = months[i];
    const key = r.type === "income" ? "income" : "expense";
    for (const bucket of [m, m.byWorkspace[r.workspace], total, byWorkspace[r.workspace]]) {
      if (!bucket) continue;
      bucket[key] += r.amountPaise;
      bucket.net = bucket.income - bucket.expense;
    }
  }
  return { months, total, byWorkspace };
}

// ---------------------------------------------------------------------------
// Expenses by category
// ---------------------------------------------------------------------------

export type CategorySlice = { id: string | null; name: string; amountPaise: number; share: number };

/** Sorted category totals; anything past `top` folds into "Other". Shares in whole percent. */
export function expensesByCategory(rows: { categoryId: string | null; categoryName: string | null; amountPaise: number }[], top = 7): { slices: CategorySlice[]; totalPaise: number } {
  const map = new Map<string, { id: string | null; name: string; amountPaise: number }>();
  for (const r of rows) {
    const k = r.categoryId ?? "__none";
    const cur = map.get(k) ?? { id: r.categoryId, name: r.categoryName ?? "Uncategorised", amountPaise: 0 };
    cur.amountPaise += r.amountPaise;
    map.set(k, cur);
  }
  const all = [...map.values()].filter((x) => x.amountPaise > 0).sort((a, b) => b.amountPaise - a.amountPaise);
  const totalPaise = all.reduce((s, x) => s + x.amountPaise, 0);
  const share = (n: number) => (totalPaise ? Math.round((n / totalPaise) * 1000) / 10 : 0);
  const head = all.slice(0, top).map((x) => ({ ...x, share: share(x.amountPaise) }));
  const rest = all.slice(top);
  if (rest.length) {
    const amt = rest.reduce((s, x) => s + x.amountPaise, 0);
    head.push({ id: null, name: `Other (${rest.length})`, amountPaise: amt, share: share(amt) });
  }
  return { slices: head, totalPaise };
}

// ---------------------------------------------------------------------------
// Receivables ageing
// ---------------------------------------------------------------------------

export const AGEING_BUCKETS = ["not_due", "0_30", "31_60", "61_90", "90_plus"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export const AGEING_LABELS: Record<AgeingBucket, string> = {
  not_due: "Not yet due",
  "0_30": "0–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_plus": "90+ days",
};

/** Bucket by days past the due date (0 = due today). */
export function ageingBucket(dueDate: string, today: string): AgeingBucket {
  const late = diffDays(dueDate, today);
  if (late < 0) return "not_due";
  if (late <= 30) return "0_30";
  if (late <= 60) return "31_60";
  if (late <= 90) return "61_90";
  return "90_plus";
}

export type ReceivableRow = { id: string; number: string; client: string; clientKey: string; dueDate: string; totalPaise: number; paidPaise: number };
export type AgeingResult = {
  totals: Record<AgeingBucket, number>;
  totalPaise: number;
  overduePaise: number;
  clients: { key: string; name: string; buckets: Record<AgeingBucket, number>; totalPaise: number; invoices: number; oldestDays: number }[];
};

export function receivablesAgeing(rows: ReceivableRow[], today: string): AgeingResult {
  const empty = () => Object.fromEntries(AGEING_BUCKETS.map((b) => [b, 0])) as Record<AgeingBucket, number>;
  const totals = empty();
  const clients = new Map<string, AgeingResult["clients"][number]>();
  for (const r of rows) {
    const bal = r.totalPaise - r.paidPaise;
    if (bal <= 0) continue;
    const b = ageingBucket(r.dueDate, today);
    totals[b] += bal;
    const c = clients.get(r.clientKey) ?? { key: r.clientKey, name: r.client, buckets: empty(), totalPaise: 0, invoices: 0, oldestDays: -Infinity };
    c.buckets[b] += bal;
    c.totalPaise += bal;
    c.invoices += 1;
    c.oldestDays = Math.max(c.oldestDays, diffDays(r.dueDate, today));
    clients.set(r.clientKey, c);
  }
  const totalPaise = AGEING_BUCKETS.reduce((s, b) => s + totals[b], 0);
  return {
    totals,
    totalPaise,
    overduePaise: totalPaise - totals.not_due,
    clients: [...clients.values()].sort((a, b) => b.totalPaise - a.totalPaise),
  };
}

// ---------------------------------------------------------------------------
// GST summary
// ---------------------------------------------------------------------------

export type GstInvoiceRow = { issueDate: string; subtotalPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };
export type GstMonth = { month: string; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; outputPaise: number; inputPaise: number; netPaise: number };

/** Output GST (invoices issued) vs input GST (expense transactions) per month; net payable = output − input. */
export function gstSummary(invoicesIssued: GstInvoiceRow[], expenseGst: { date: string; gstPaise: number }[], months: string[]): { months: GstMonth[]; total: Omit<GstMonth, "month"> } {
  const out = months.map((month) => ({ month, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, outputPaise: 0, inputPaise: 0, netPaise: 0 }));
  const idx = new Map(out.map((m, i) => [m.month, i]));
  for (const inv of invoicesIssued) {
    const i = idx.get(inv.issueDate.slice(0, 7));
    if (i == null) continue;
    const m = out[i];
    m.taxablePaise += inv.subtotalPaise;
    m.cgstPaise += inv.cgstPaise;
    m.sgstPaise += inv.sgstPaise;
    m.igstPaise += inv.igstPaise;
  }
  for (const e of expenseGst) {
    const i = idx.get(e.date.slice(0, 7));
    if (i != null) out[i].inputPaise += e.gstPaise;
  }
  const total = { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, outputPaise: 0, inputPaise: 0, netPaise: 0 };
  for (const m of out) {
    m.outputPaise = m.cgstPaise + m.sgstPaise + m.igstPaise;
    m.netPaise = m.outputPaise - m.inputPaise;
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += m[k];
  }
  return { months: out, total };
}

// ---------------------------------------------------------------------------
// Budget vs actual
// ---------------------------------------------------------------------------

export type BudgetLine = { id: string; name: string; budgetPaise: number; actualPaise: number; pct: number; remainingPaise: number; status: "under" | "near" | "over" };

/** Categories with a monthly budget × months in the period, vs actual expense. */
export function budgetVsActual(
  categories: { id: string; name: string; monthlyBudgetPaise: number | null }[],
  actualByCategory: Map<string, number>,
  monthsInPeriod = 1,
): BudgetLine[] {
  return categories
    .filter((c) => (c.monthlyBudgetPaise ?? 0) > 0)
    .map((c) => {
      const budget = c.monthlyBudgetPaise! * monthsInPeriod;
      const actual = actualByCategory.get(c.id) ?? 0;
      const pct = budget ? Math.round((actual / budget) * 100) : 0;
      return { id: c.id, name: c.name, budgetPaise: budget, actualPaise: actual, pct, remainingPaise: budget - actual, status: (pct > 100 ? "over" : pct >= 85 ? "near" : "under") as BudgetLine["status"] };
    })
    .sort((a, b) => b.pct - a.pct);
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export type TimeRow = { startedAt: Date; minutes: number; workspace: WorkspaceKey; projectId: string | null; projectName: string | null };

/** Monday of the IST week (input is an IST day). */
export function mondayOf(day: string): string {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((wd + 6) % 7));
}

export function timeReport(rows: TimeRow[], weeks: number, today: string, toIstDay: (d: Date) => string) {
  const firstWeek = addDays(mondayOf(today), -7 * (weeks - 1));
  const weekKeys = Array.from({ length: weeks }, (_, i) => addDays(firstWeek, 7 * i));
  const series = weekKeys.map((week) => ({ week, personal: 0, mahisys: 0, dsa: 0 }));
  const byWorkspace = { personal: 0, mahisys: 0, dsa: 0 } as Record<WorkspaceKey, number>;
  const projects = new Map<string, { id: string | null; name: string; workspace: WorkspaceKey; minutes: number }>();
  let total = 0;
  for (const r of rows) {
    const day = toIstDay(r.startedAt);
    if (day < firstWeek || day > today) continue;
    const w = Math.floor(diffDays(firstWeek, day) / 7);
    series[w][r.workspace] += r.minutes;
    byWorkspace[r.workspace] += r.minutes;
    total += r.minutes;
    const pk = r.projectId ?? `none:${r.workspace}`;
    const p = projects.get(pk) ?? { id: r.projectId, name: r.projectName ?? "No project", workspace: r.workspace, minutes: 0 };
    p.minutes += r.minutes;
    projects.set(pk, p);
  }
  return { series, byWorkspace, total, projects: [...projects.values()].sort((a, b) => b.minutes - a.minutes), from: firstWeek };
}

// ---------------------------------------------------------------------------
// Estimate accuracy
// ---------------------------------------------------------------------------

export type EstimateRow = { taskType: string | null; estimateMinutes: number; actualMinutes: number };
export type EstimateLine = { taskType: string; tasks: number; estimateMinutes: number; actualMinutes: number; ratio: number; verdict: "spot_on" | "over" | "under" };

/** Actual ÷ estimate per task type (ratio 1 = perfect). Within ±15% is "spot on". */
export function estimateAccuracy(rows: EstimateRow[]): { lines: EstimateLine[]; overall: EstimateLine | null } {
  const map = new Map<string, EstimateLine>();
  const verdict = (r: number): EstimateLine["verdict"] => (r > 1.15 ? "under" : r < 0.85 ? "over" : "spot_on");
  for (const r of rows) {
    if (!(r.estimateMinutes > 0) || !(r.actualMinutes > 0)) continue;
    const k = r.taskType?.trim() || "Untyped";
    const cur = map.get(k) ?? { taskType: k, tasks: 0, estimateMinutes: 0, actualMinutes: 0, ratio: 0, verdict: "spot_on" as const };
    cur.tasks += 1;
    cur.estimateMinutes += r.estimateMinutes;
    cur.actualMinutes += r.actualMinutes;
    map.set(k, cur);
  }
  const lines = [...map.values()]
    .map((l) => {
      const ratio = Math.round((l.actualMinutes / l.estimateMinutes) * 100) / 100;
      return { ...l, ratio, verdict: verdict(ratio) };
    })
    .sort((a, b) => b.tasks - a.tasks);
  if (!lines.length) return { lines, overall: null };
  const est = lines.reduce((s, l) => s + l.estimateMinutes, 0);
  const act = lines.reduce((s, l) => s + l.actualMinutes, 0);
  const ratio = Math.round((act / est) * 100) / 100;
  return { lines, overall: { taskType: "All", tasks: lines.reduce((s, l) => s + l.tasks, 0), estimateMinutes: est, actualMinutes: act, ratio, verdict: verdict(ratio) } };
}
