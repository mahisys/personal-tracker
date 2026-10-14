import "server-only";
import type { WorkspaceKey } from "@/db/schema";
import { getAccountBalances, liquidBalance } from "@/server/ledger";
import { getSettings } from "@/server/settings";
import { addDays, todayIST } from "@/lib/dates";
import { billsComingUp, billsDueTotal, billsNeedingYou } from "./bills";
import { invoicesComingUp, invoicesExpectedTotal, invoicesNeedingYou } from "./invoices";
import { leadsComingUp, leadsNeedingYou } from "./leads";
import { loanFilesNeedingYou, payoutsComingUp, payoutsExpectedTotal } from "./loan-files";
import { renewalsComingUp, renewalsNeedingYou } from "./renewals";
import { computeStreak } from "./streak";
import { completionDays, plateToday, tasksComingUp, tasksDoneOn, tasksNeedingYou } from "./tasks";
import type { ComingUpItem, NeedsItem, NeedsKind } from "./types";

const KIND_RANK: Record<NeedsKind, number> = { task: 0, bill: 1, invoice: 2, lead: 3, loan_file: 4, renewal: 5 };

/**
 * One prioritised list: overdue first (oldest first), then today's items, then undated ones.
 * Within a day, tasks come first (by priority and time), then money, then people.
 */
export function sortNeeds(items: NeedsItem[]): NeedsItem[] {
  return [...items].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const ad = a.date ?? "9999-12-31";
    const bd = b.date ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    if (a.kind !== b.kind) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if ((a.priority ?? 3) !== (b.priority ?? 3)) return (a.priority ?? 3) - (b.priority ?? 3);
    const at = a.dueTime ?? "99:99";
    const bt = b.dueTime ?? "99:99";
    if (at !== bt) return at < bt ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export async function getNeedsYou(ws: WorkspaceKey | null, today: string, now: Date = new Date()): Promise<NeedsItem[]> {
  const lists = await Promise.all([
    tasksNeedingYou(ws, today),
    leadsNeedingYou(ws, today),
    billsNeedingYou(ws, today, 3),
    invoicesNeedingYou(ws, today),
    loanFilesNeedingYou(ws, today, now),
    renewalsNeedingYou(ws, today),
  ]);
  return sortNeeds(lists.flat());
}

/** The next 7 days (tomorrow → today+7), grouped by day, without anything already in "Needs you". */
export async function getComingUp(ws: WorkspaceKey | null, today: string, exclude: Set<string> = new Set()) {
  const from = addDays(today, 1);
  const to = addDays(today, 7);
  const lists = await Promise.all([
    tasksComingUp(ws, from, to),
    billsComingUp(ws, from, to),
    invoicesComingUp(ws, from, to),
    leadsComingUp(ws, from, to),
    payoutsComingUp(ws, from, to),
    renewalsComingUp(ws, from, to),
  ]);
  const items = lists.flat().filter((i) => !exclude.has(i.key));
  const days = new Map<string, ComingUpItem[]>();
  for (const i of items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const arr = days.get(i.date) ?? [];
    arr.push(i);
    days.set(i.date, arr);
  }
  return [...days.entries()].map(([date, items]) => ({ date, items }));
}

/** Liquid money (bank, cash, UPI, wallet) in accounts visible in the workspace (shared accounts always count). */
export async function cashInHand(ws: WorkspaceKey | null): Promise<number> {
  const balances = await getAccountBalances();
  return liquidBalance(balances.filter((b) => !ws || b.workspace == null || b.workspace === ws));
}

export async function getTodayStats(ws: WorkspaceKey | null, today: string) {
  const weekEnd = addDays(today, 7);
  const [settings, cash, billsDue, invoicesIn, payoutsIn, plate, doneToday, days] = await Promise.all([
    getSettings(),
    cashInHand(ws),
    billsDueTotal(ws, today, 7),
    invoicesExpectedTotal(ws, weekEnd),
    payoutsExpectedTotal(ws, weekEnd),
    plateToday(ws, today),
    tasksDoneOn(ws, today),
    completionDays(ws, today),
  ]);
  const plateTotal = doneToday + plate.count;
  return {
    cashPaise: cash,
    billsDue,
    expectedIn: { totalPaise: invoicesIn.totalPaise + payoutsIn.totalPaise, invoices: invoicesIn, payouts: payoutsIn },
    hours: {
      plannedMinutes: plate.remainingMinutes,
      availableMinutes: Math.round(settings.planning.dailyHours * 60),
      unestimated: plate.unestimated,
      isWorkday: settings.planning.workdays.includes(new Date(`${today}T00:00:00Z`).getUTCDay()),
    },
    progress: { done: doneToday, open: plate.count, dueToday: plate.dueTodayCount, percent: plateTotal === 0 ? 0 : Math.round((doneToday / plateTotal) * 100) },
    streak: computeStreak(days, today),
  };
}

export async function getTodayData(ws: WorkspaceKey | null, now: Date = new Date()) {
  const today = todayIST(now);
  const [needs, stats] = await Promise.all([getNeedsYou(ws, today, now), getTodayStats(ws, today)]);
  const comingUp = await getComingUp(ws, today, new Set(needs.map((n) => n.key)));
  return { today, needs, stats, comingUp };
}

// Re-exported so callers have one import.
export type { ComingUpItem, NeedsItem };
