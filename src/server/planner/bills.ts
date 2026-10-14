/** Pure helpers for bills and renewals. */
import type { BillKind, BillPriority } from "@/db/schema";
import { addDays, diffDays, endOfMonth } from "@/lib/dates";

export const BILL_KIND_LABEL: Record<BillKind, string> = {
  bill: "Bill",
  emi: "EMI",
  credit_card: "Credit card",
  rent: "Rent",
  subscription: "Subscription",
  insurance: "Insurance",
  utility: "Utility",
  tax: "Tax",
  salary: "Salary",
  vendor: "Vendor",
  fees: "Fees",
  other: "Other",
};

export const PRIORITY_META: Record<BillPriority, { label: string; tone: "bad" | "warn" | "info" }> = {
  must: { label: "Must pay", tone: "bad" },
  important: { label: "Important", tone: "warn" },
  can_wait: { label: "Can wait", tone: "info" },
};

export type BillGroupKey = "overdue" | "week" | "month" | "later";

export const BILL_GROUP_LABEL: Record<BillGroupKey, string> = {
  overdue: "Overdue",
  week: "This week",
  month: "This month",
  later: "Later",
};

/** Overdue (before today) · This week (next 7 days) · This month (rest of the calendar month) · Later. */
export function billGroup(dueDate: string, today: string): BillGroupKey {
  if (dueDate < today) return "overdue";
  if (dueDate <= addDays(today, 6)) return "week";
  if (dueDate <= endOfMonth(today)) return "month";
  return "later";
}

export function groupBills<T extends { dueDate: string }>(bills: T[], today: string): { key: BillGroupKey; label: string; items: T[] }[] {
  const order: BillGroupKey[] = ["overdue", "week", "month", "later"];
  const map = new Map<BillGroupKey, T[]>(order.map((k) => [k, []]));
  for (const b of [...bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) map.get(billGroup(b.dueDate, today))!.push(b);
  return order.map((key) => ({ key, label: BILL_GROUP_LABEL[key], items: map.get(key)! })).filter((g) => g.items.length > 0);
}

/** "3,1" / "7, 3, 0" → [7, 3, 0] (unique, 0–365, largest first). */
export function parseRemindDays(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const nums = raw
    .split(/[,\s]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 365);
  return [...new Set(nums)].sort((a, b) => b - a);
}

/** Next due date's latest-date keeps the same slack as the current instance. */
export function shiftLatestDate(dueDate: string, latestDate: string | null, nextDue: string): string | null {
  if (!latestDate) return null;
  return addDays(nextDue, Math.max(0, diffDays(dueDate, latestDate)));
}

export type RenewalUrgency = { days: number; tone: "bad" | "warn" | "info" | "good"; label: string };

/** Countdown chip for a renewal expiry. */
export function renewalUrgency(expiresOn: string, today: string, remindDaysBefore = 30): RenewalUrgency {
  const days = diffDays(today, expiresOn);
  if (days < 0) return { days, tone: "bad", label: `Expired ${-days} day${days === -1 ? "" : "s"} ago` };
  if (days === 0) return { days, tone: "bad", label: "Expires today" };
  if (days <= Math.min(7, remindDaysBefore)) return { days, tone: "bad", label: `${days} day${days === 1 ? "" : "s"} left` };
  if (days <= remindDaysBefore) return { days, tone: "warn", label: `${days} days left` };
  if (days <= 90) return { days, tone: "info", label: `${days} days left` };
  const months = Math.round(days / 30);
  return { days, tone: "good", label: months >= 12 ? `${Math.floor(months / 12)}y ${months % 12}m left` : `${months} months left` };
}
