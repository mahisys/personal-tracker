/** Pure CRM helpers: follow-up states, weighted values, quick follow-up dates. */
import { addDays, diffDays, istToInstant, toISTDate } from "@/lib/dates";

export type FollowUpState = "overdue" | "today" | "upcoming" | "none";

export function followUpState(at: Date | null | undefined, today: string): FollowUpState {
  if (!at) return "none";
  const d = toISTDate(at);
  if (d < today) return "overdue";
  if (d === today) return "today";
  return "upcoming";
}

export const FOLLOW_UP_CLASS: Record<FollowUpState, string> = {
  overdue: "text-rose-600 dark:text-rose-300",
  today: "text-amber-600 dark:text-amber-300",
  upcoming: "text-fg-muted",
  none: "text-fg-subtle",
};

/** Whole days since an instant (IST calendar days). Null when never. */
export function daysSince(at: Date | null | undefined, today: string): number | null {
  if (!at) return null;
  return Math.max(0, diffDays(toISTDate(at), today));
}

export function weightedValue(leads: { valuePaise: number; probability: number }[]): number {
  return leads.reduce((s, l) => s + Math.round((l.valuePaise * l.probability) / 100), 0);
}

/** Follow-up N days from today at 10:00 IST. */
export function followUpInDays(n: number, today: string): Date {
  return istToInstant(addDays(today, n), "10:00");
}

export const ACTIVITY_LABEL: Record<string, string> = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  whatsapp: "WhatsApp",
  visit: "Visit",
  note: "Note",
};

export const LEAD_SOURCES = ["Referral", "Website", "WhatsApp", "LinkedIn", "Cold call", "Walk-in", "Existing client", "Event", "Other"];
