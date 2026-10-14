/**
 * Cash-flow forecast: pure core. Given today's liquid balance, upcoming bills, open invoices and
 * expected DSA payouts, projects the balance day by day and proposes bill moves that keep it above
 * the safety threshold. The DB loader lives in ./forecast.ts.
 */
import type { BillPriority, Recurrence } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { nextOccurrence } from "@/lib/recurrence";

export type ForecastItem = { kind: "bill" | "invoice" | "payout"; id: string; label: string; amountPaise: number; movable?: boolean };

export type ForecastDay = { date: string; inPaise: number; outPaise: number; balancePaise: number; items: ForecastItem[] };

export type ForecastSuggestion = { billId: string; title: string; amountPaise: number; fromDate: string; toDate: string };

export type CashForecast = {
  startBalancePaise: number;
  /** The settings threshold you want to stay above */
  minBalancePaise: number;
  days: ForecastDay[];
  lowest: { date: string; balancePaise: number };
  shortfall: null | { firstDate: string; amountPaise: number };
  suggestions: ForecastSuggestion[];
};

export type ForecastBill = {
  id: string;
  title: string;
  amountPaise: number;
  dueDate: string;
  priority: BillPriority;
  canMove: boolean;
  latestDate: string | null;
  recurrence: Recurrence | null;
  seriesId: string | null;
};

export type ForecastInvoice = { id: string; label: string; balancePaise: number; dueDate: string };
export type ForecastPayout = { id: string; label: string; amountPaise: number; expectedDate: string | null };

export type ForecastInput = {
  today: string;
  /** Number of days in the horizon, starting today */
  days: number;
  startBalancePaise: number;
  minBalancePaise: number;
  bills: ForecastBill[];
  invoices: ForecastInvoice[];
  payouts: ForecastPayout[];
};

/** Overdue invoices are assumed to arrive a few days from now; payouts with no date in a month. */
export const OVERDUE_INFLOW_DELAY_DAYS = 3;
export const UNDATED_PAYOUT_DAYS = 30;

type Flow = { date: string; dir: "in" | "out"; item: ForecastItem };

const PRIORITY_ORDER: Record<BillPriority, number> = { can_wait: 0, important: 1, must: 2 };

/** All outflows from bills: real instances on their due date (overdue → today) plus virtual recurring occurrences. */
export function billFlows(bills: ForecastBill[], today: string, end: string): Flow[] {
  const flows: Flow[] = [];
  // Only expand the latest upcoming instance of each series, so two real instances never double count.
  const latestBySeries = new Map<string, ForecastBill>();
  for (const b of bills) {
    const key = b.seriesId ?? b.id;
    const cur = latestBySeries.get(key);
    if (!cur || b.dueDate > cur.dueDate) latestBySeries.set(key, b);
  }
  for (const b of bills) {
    if (b.amountPaise <= 0) continue;
    const date = b.dueDate < today ? today : b.dueDate;
    if (date <= end) {
      flows.push({
        date,
        dir: "out",
        item: { kind: "bill", id: b.id, label: b.title, amountPaise: b.amountPaise, movable: isMovable(b, date) },
      });
    }
    if (b.recurrence && latestBySeries.get(b.seriesId ?? b.id) === b) {
      const anchor = Number(b.dueDate.slice(8, 10));
      let prev = b.dueDate;
      for (let guard = 0; guard < 400; guard++) {
        const next = nextOccurrence(b.recurrence, prev, anchor);
        if (!next || next > end) break;
        if (next >= today) {
          flows.push({ date: next, dir: "out", item: { kind: "bill", id: b.id, label: b.title, amountPaise: b.amountPaise, movable: false } });
        }
        prev = next;
      }
    }
  }
  return flows;
}

function isMovable(b: ForecastBill, effectiveDate: string): boolean {
  return b.canMove && b.priority !== "must" && !!b.latestDate && b.latestDate > effectiveDate;
}

export function inflowFlows(input: Pick<ForecastInput, "invoices" | "payouts" | "today">, end: string): Flow[] {
  const { today } = input;
  const flows: Flow[] = [];
  for (const inv of input.invoices) {
    if (inv.balancePaise <= 0) continue;
    const date = inv.dueDate < today ? addDays(today, OVERDUE_INFLOW_DELAY_DAYS) : inv.dueDate;
    if (date <= end) flows.push({ date, dir: "in", item: { kind: "invoice", id: inv.id, label: inv.label, amountPaise: inv.balancePaise } });
  }
  for (const p of input.payouts) {
    if (p.amountPaise <= 0) continue;
    const date =
      p.expectedDate == null
        ? addDays(today, UNDATED_PAYOUT_DAYS)
        : p.expectedDate < today
          ? addDays(today, OVERDUE_INFLOW_DELAY_DAYS)
          : p.expectedDate;
    if (date <= end) flows.push({ date, dir: "in", item: { kind: "payout", id: p.id, label: p.label, amountPaise: p.amountPaise } });
  }
  return flows;
}

/** Day-by-day series from flows. */
export function projectDays(today: string, days: number, start: number, flows: Flow[]): ForecastDay[] {
  const byDate = new Map<string, Flow[]>();
  for (const f of flows) {
    const list = byDate.get(f.date) ?? [];
    list.push(f);
    byDate.set(f.date, list);
  }
  const out: ForecastDay[] = [];
  let bal = start;
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const list = byDate.get(date) ?? [];
    let inP = 0;
    let outP = 0;
    for (const f of list) {
      if (f.dir === "in") inP += f.item.amountPaise;
      else outP += f.item.amountPaise;
    }
    bal += inP - outP;
    // Money in first, then money out; larger amounts first within each.
    const items = [...list]
      .sort((a, b) => (a.dir === b.dir ? b.item.amountPaise - a.item.amountPaise : a.dir === "in" ? -1 : 1))
      .map((f) => f.item);
    out.push({ date, inPaise: inP, outPaise: outP, balancePaise: bal, items });
  }
  return out;
}

function lowestOf(days: ForecastDay[], start: number, today: string) {
  let lowest = { date: today, balancePaise: start };
  if (days.length) lowest = { date: days[0].date, balancePaise: days[0].balancePaise };
  for (const d of days) if (d.balancePaise < lowest.balancePaise) lowest = { date: d.date, balancePaise: d.balancePaise };
  return lowest;
}

function firstDip(days: ForecastDay[], min: number): ForecastDay | null {
  return days.find((d) => d.balancePaise < min) ?? null;
}

/**
 * Projects the balance and, when it dips below the threshold, proposes moving flexible bills
 * (can-wait first, then important; never must-pay) to their latest safe date, re-checking after each
 * move until the dip is gone or nothing else can move.
 */
export function buildForecast(input: ForecastInput): CashForecast {
  const days = Math.max(1, Math.floor(input.days));
  const end = addDays(input.today, days - 1);
  const outflows = billFlows(input.bills, input.today, end);
  const inflows = inflowFlows(input, end);
  const series = projectDays(input.today, days, input.startBalancePaise, [...inflows, ...outflows]);
  const lowest = lowestOf(series, input.startBalancePaise, input.today);
  const dip = firstDip(series, input.minBalancePaise);
  const shortfall = dip ? { firstDate: dip.date, amountPaise: input.minBalancePaise - lowest.balancePaise } : null;

  const suggestions: ForecastSuggestion[] = [];
  if (dip) {
    const billsById = new Map(input.bills.map((b) => [b.id, b]));
    // Mutable copy of the real (non-virtual) movable bill flows.
    const flows = [...inflows, ...outflows.map((f) => ({ ...f }))];
    const moved = new Set<string>();
    for (let guard = 0; guard < 200; guard++) {
      const s = projectDays(input.today, days, input.startBalancePaise, flows);
      const d = firstDip(s, input.minBalancePaise);
      if (!d) break;
      const candidates = flows
        .filter((f) => f.dir === "out" && f.item.movable && !moved.has(f.item.id))
        .filter((f) => {
          const b = billsById.get(f.item.id)!;
          return f.date <= d.date && !!b.latestDate && b.latestDate > d.date;
        })
        .sort((a, b) => {
          const pa = PRIORITY_ORDER[billsById.get(a.item.id)!.priority];
          const pb = PRIORITY_ORDER[billsById.get(b.item.id)!.priority];
          if (pa !== pb) return pa - pb;
          if (a.item.amountPaise !== b.item.amountPaise) return b.item.amountPaise - a.item.amountPaise;
          return a.date.localeCompare(b.date);
        });
      const pick = candidates[0];
      if (!pick) break;
      const bill = billsById.get(pick.item.id)!;
      suggestions.push({ billId: bill.id, title: bill.title, amountPaise: bill.amountPaise, fromDate: pick.date, toDate: bill.latestDate! });
      moved.add(bill.id);
      const idx = flows.indexOf(pick);
      if (bill.latestDate! <= end) flows[idx] = { ...pick, date: bill.latestDate! };
      else flows.splice(idx, 1);
    }
  }

  return { startBalancePaise: input.startBalancePaise, minBalancePaise: input.minBalancePaise, days: series, lowest, shortfall, suggestions };
}
