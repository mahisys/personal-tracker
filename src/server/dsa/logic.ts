/**
 * Pure DSA calculations: payout grid lookup, payout amounts, staleness/pendency, funnel and
 * approval rates, earnings roll-ups. No database access here — everything is unit tested.
 */
import type { LoanProduct, LoanStage, PendingWith } from "@/db/schema";
import { applyBps } from "@/lib/money";
import { addDays, diffDays, monthKey, toISTDate } from "@/lib/dates";
import { STAGE_LIMIT_DAYS, isClosedStage, stageIndex } from "./constants";

// ---------------------------------------------------------------------------
// Payout grid
// ---------------------------------------------------------------------------

export type GridRow = {
  id?: string;
  lenderId: string;
  product: LoanProduct;
  minTicketPaise: number;
  maxTicketPaise: number | null;
  rateBps: number;
};

/**
 * Finds the payout rate for a disbursed amount: rows for the lender + product where
 * min ≤ amount ≤ max (null max = no upper limit). When several match, the narrowest range wins
 * (an open-ended row counts as infinitely wide); ties go to the higher minimum, then the higher rate.
 */
export function findPayoutRate<T extends GridRow>(grid: T[], lenderId: string, product: LoanProduct, amountPaise: number): T | null {
  const matches = grid.filter(
    (r) => r.lenderId === lenderId && r.product === product && r.minTicketPaise <= amountPaise && (r.maxTicketPaise == null || amountPaise <= r.maxTicketPaise),
  );
  if (matches.length === 0) return null;
  const width = (r: T) => (r.maxTicketPaise == null ? Number.POSITIVE_INFINITY : r.maxTicketPaise - r.minTicketPaise);
  matches.sort((a, b) => {
    const wa = width(a);
    const wb = width(b);
    if (wa !== wb) return wa < wb ? -1 : 1;
    if (a.minTicketPaise !== b.minTicketPaise) return b.minTicketPaise - a.minTicketPaise;
    return b.rateBps - a.rateBps;
  });
  return matches[0];
}

// ---------------------------------------------------------------------------
// Payout amounts
// ---------------------------------------------------------------------------

export type PayoutAmounts = {
  grossPaise: number;
  gstPaise: number;
  tdsPaise: number;
  /** What the lender actually transfers: gross + GST − TDS */
  netPaise: number;
  subConnectorSharePaise: number;
  /** What you keep after TDS and the partner's share (GST is passed to the government) */
  inHandPaise: number;
};

/** Splits a gross commission into GST, TDS, sub-connector share and net. */
export function payoutBreakdown(grossPaise: number, opts: { gstBps: number; tdsBps: number; subShareBps?: number | null }): PayoutAmounts {
  const gstPaise = applyBps(grossPaise, opts.gstBps);
  const tdsPaise = applyBps(grossPaise, opts.tdsBps);
  const subConnectorSharePaise = opts.subShareBps ? applyBps(grossPaise, opts.subShareBps) : 0;
  return {
    grossPaise,
    gstPaise,
    tdsPaise,
    netPaise: grossPaise + gstPaise - tdsPaise,
    subConnectorSharePaise,
    inHandPaise: grossPaise - tdsPaise - subConnectorSharePaise,
  };
}

/** Full payout for a disbursal: gross = disbursed × rate, then the breakdown. */
export function computePayout(disbursedPaise: number, rateBps: number | null | undefined, opts: { gstBps: number; tdsBps: number; subShareBps?: number | null }): PayoutAmounts {
  const gross = rateBps ? applyBps(disbursedPaise, rateBps) : 0;
  return payoutBreakdown(gross, opts);
}

export function netOf(p: { grossPaise: number; gstPaise: number; tdsPaise: number }): number {
  return p.grossPaise + p.gstPaise - p.tdsPaise;
}

export function expectedPayoutDate(disbursalDate: string, payoutDays: number): string {
  return addDays(disbursalDate, payoutDays);
}

// ---------------------------------------------------------------------------
// Staleness and pendency (IST calendar days)
// ---------------------------------------------------------------------------

export type Staleness = "fresh" | "over" | "way_over";

export function daysSince(instant: Date, today: string): number {
  return Math.max(0, diffDays(toISTDate(instant), today));
}

/** Days in the current stage vs its limit. Over the limit = amber, 2× the limit = rose. */
export function stageStaleness(stage: LoanStage, stageChangedAt: Date, today: string, limits: Partial<Record<LoanStage, number>> = STAGE_LIMIT_DAYS) {
  const days = daysSince(stageChangedAt, today);
  const limit = limits[stage] ?? null;
  let level: Staleness = "fresh";
  if (limit != null && limit > 0) {
    if (days >= limit * 2) level = "way_over";
    else if (days > limit) level = "over";
  }
  return { days, limit, level, overBy: limit != null ? Math.max(0, days - limit) : 0 };
}

export type PendencyFile = {
  id: string;
  pendingWith: PendingWith;
  stageChangedAt: Date;
  /** When pending-with was last changed (if known) */
  pendingSince?: Date | null;
};

/** Days a file has been waiting on whoever it is pending with. */
export function daysWaiting(f: PendencyFile, today: string): number {
  const since = f.pendingSince && f.pendingSince > f.stageChangedAt ? f.pendingSince : f.stageChangedAt;
  return daysSince(since, today);
}

/** Groups files by pending-with, longest-waiting first inside each group. */
export function groupPendency<T extends PendencyFile>(files: T[], today: string, order: PendingWith[]): { key: PendingWith; files: (T & { waiting: number })[] }[] {
  const groups = new Map<PendingWith, (T & { waiting: number })[]>();
  for (const k of order) groups.set(k, []);
  for (const f of files) {
    const list = groups.get(f.pendingWith) ?? [];
    list.push({ ...f, waiting: daysWaiting(f, today) });
    groups.set(f.pendingWith, list);
  }
  return Array.from(groups.entries()).map(([key, list]) => ({ key, files: list.sort((a, b) => b.waiting - a.waiting) }));
}

// ---------------------------------------------------------------------------
// Funnel and approval rate
// ---------------------------------------------------------------------------

/** The furthest pipeline stage a file has reached, from its current stage and stage history. */
export function furthestStageIndex(current: LoanStage, history: LoanStage[] = []): number {
  let best = -1;
  for (const s of [current, ...history]) {
    if (isClosedStage(s)) continue;
    best = Math.max(best, stageIndex(s));
  }
  return Math.max(best, 0);
}

export type FunnelInput = { stage: LoanStage; history?: LoanStage[] };

const FUNNEL_STEPS = [
  { key: "lead", label: "Leads" },
  { key: "logged_in", label: "Logged in" },
  { key: "sanctioned", label: "Sanctioned" },
  { key: "disbursed", label: "Disbursed" },
] as const satisfies { key: LoanStage; label: string }[];

/** Lead → logged in → sanctioned → disbursed counts, with conversion from the first step. */
export function funnel(files: FunnelInput[]) {
  const reached = files.map((f) => furthestStageIndex(f.stage, f.history));
  const total = files.length;
  return FUNNEL_STEPS.map((s) => {
    const idx = stageIndex(s.key);
    const count = reached.filter((r) => r >= idx).length;
    return { key: s.key, label: s.label, count, pct: total ? Math.round((count / total) * 100) : 0 };
  });
}

/**
 * Approval rate: of files a lender decided on, how many were sanctioned (or went further).
 * Rejected files count against; dropped files and undecided files are ignored.
 */
export function approvalStats(files: FunnelInput[]) {
  let approved = 0;
  let rejected = 0;
  const sanctionIdx = stageIndex("sanctioned");
  for (const f of files) {
    if (f.stage === "rejected") rejected++;
    else if (furthestStageIndex(f.stage, f.history) >= sanctionIdx) approved++;
  }
  const decided = approved + rejected;
  return { approved, rejected, decided, rate: decided ? Math.round((approved / decided) * 100) : null };
}

/** Average whole days from login to disbursal across files that have both dates. */
export function avgLoginToDisbursal(files: { loginDate: string | null; disbursalDate: string | null }[]): number | null {
  const spans = files.filter((f) => f.loginDate && f.disbursalDate).map((f) => diffDays(f.loginDate!, f.disbursalDate!));
  if (spans.length === 0) return null;
  return Math.round(spans.reduce((s, n) => s + n, 0) / spans.length);
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export type EarningRow = {
  disbursalDate: string | null;
  grossPaise: number;
  gstPaise: number;
  tdsPaise: number;
  subConnectorSharePaise: number;
};

/** The last `n` month keys ending with the month of `today`, oldest first. */
export function lastMonths(today: string, n = 12): string[] {
  const out: string[] = [];
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}

/** Gross vs in-hand earnings per month (by disbursal month) for the last 12 months. */
export function monthlyEarnings(rows: EarningRow[], today: string, n = 12) {
  const months = lastMonths(today, n);
  const map = new Map(months.map((k) => [k, { month: k, gross: 0, net: 0 }]));
  for (const r of rows) {
    if (!r.disbursalDate) continue;
    const b = map.get(monthKey(r.disbursalDate));
    if (!b) continue;
    b.gross += r.grossPaise;
    b.net += r.grossPaise - r.tdsPaise - r.subConnectorSharePaise;
  }
  return months.map((k) => map.get(k)!);
}

/** Sums a list by a key, largest first. */
export function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  return Array.from(m.entries())
    .map(([k, v]) => ({ key: k, value: v }))
    .sort((a, b) => b.value - a.value);
}

export function totals(rows: { grossPaise: number; gstPaise: number; tdsPaise: number; subConnectorSharePaise?: number }[]) {
  let gross = 0;
  let gst = 0;
  let tds = 0;
  let sub = 0;
  for (const r of rows) {
    gross += r.grossPaise;
    gst += r.gstPaise;
    tds += r.tdsPaise;
    sub += r.subConnectorSharePaise ?? 0;
  }
  return { gross, gst, tds, net: gross + gst - tds, sub, inHand: gross - tds - sub };
}

