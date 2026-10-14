import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { bills, type WorkspaceKey } from "@/db/schema";
import { addDays, diffDays, formatDay } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { raiseOnce } from "../helpers";
import type { Rule } from "../types";

export type BillLite = {
  id: string;
  title: string;
  payee: string | null;
  amountPaise: number;
  dueDate: string;
  remindDaysBefore: number[];
  workspace: WorkspaceKey;
};

export type BillReminder = { kind: "bill_due" | "bill_overdue"; dedupeKey: string; title: string; body: string };

function inDays(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d} days`;
}

/**
 * Decides whether a bill needs a reminder today.
 * Before the due date: the reminder window is the smallest of the bill's remind-days (plus "due today")
 * that is ≥ days left, so a missed cron run still catches up, and each window fires once.
 * Overdue: daily for the first 3 days, then once a week.
 */
export function decideBillReminder(bill: BillLite, today: string): BillReminder | null {
  const d = diffDays(today, bill.dueDate);
  const who = bill.payee?.trim() || bill.title;
  const amount = formatINR(bill.amountPaise);
  if (d < 0) {
    const late = -d;
    if (!(late <= 3 || late % 7 === 0)) return null;
    return {
      kind: "bill_overdue",
      dedupeKey: `bill_overdue:${bill.id}:${today}`,
      title: `${amount} to ${who} is overdue`,
      body: `${bill.title} was due ${formatDay(bill.dueDate)} — ${late} day${late === 1 ? "" : "s"} ago. Pay it or move it to a new date.`,
    };
  }
  const windows = [...new Set([...(bill.remindDaysBefore ?? []), 0])].filter((n) => Number.isInteger(n) && n >= 0).sort((a, b) => a - b);
  const w = windows.find((r) => r >= d);
  if (w === undefined) return null;
  return {
    kind: "bill_due",
    dedupeKey: `bill_due:${bill.id}:${bill.dueDate}:${w}`,
    title: `${amount} due to ${who} ${inDays(d)}`,
    body: `${bill.title} · due ${formatDay(bill.dueDate)}`,
  };
}

export const billReminders: Rule = {
  key: "bill_reminders",
  async run({ today }) {
    const rows = await db
      .select({
        id: bills.id,
        title: bills.title,
        payee: bills.payee,
        amountPaise: bills.amountPaise,
        dueDate: bills.dueDate,
        remindDaysBefore: bills.remindDaysBefore,
        workspace: bills.workspace,
      })
      .from(bills)
      .where(and(eq(bills.status, "upcoming"), lte(bills.dueDate, addDays(today, 90))));
    let n = 0;
    for (const b of rows) {
      const r = decideBillReminder(b, today);
      if (!r) continue;
      if (await raiseOnce({ ...r, link: `/planner/bills/${b.id}`, workspace: b.workspace })) n++;
    }
    return { notifications: n, note: `${rows.length} upcoming bills checked` };
  },
};
