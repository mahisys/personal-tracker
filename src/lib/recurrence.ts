import type { Recurrence } from "@/db/schema";
import { addDays, addMonths, weekday } from "./dates";

/**
 * Next occurrence strictly after `from` (a "YYYY-MM-DD" day), or null when past `until`.
 * Monthly/yearly keep the original day of month (anchorDay), clamped to month length.
 */
export function nextOccurrence(rule: Recurrence, from: string, anchorDay?: number): string | null {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  let next: string;
  switch (rule.freq) {
    case "daily":
      next = addDays(from, interval);
      break;
    case "weekly": {
      const days = (rule.byWeekday ?? []).filter((d) => d >= 0 && d <= 6).sort();
      if (days.length === 0) {
        next = addDays(from, 7 * interval);
        break;
      }
      // Next listed weekday later in this week; otherwise the first listed weekday `interval` weeks on.
      const cur = weekday(from);
      const later = days.find((d) => d > cur);
      if (later !== undefined) next = addDays(from, later - cur);
      else next = addDays(from, 7 * (interval - 1) + (7 - cur) + days[0]);
      break;
    }
    case "monthly":
      next = addMonths(from, interval, anchorDay);
      break;
    case "yearly":
      next = addMonths(from, 12 * interval, anchorDay);
      break;
    default:
      return null;
  }
  if (rule.until && next > rule.until) return null;
  return next;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeRecurrence(rule: Recurrence | null | undefined): string {
  if (!rule) return "Does not repeat";
  const n = Math.max(1, rule.interval || 1);
  const every = (unit: string) => (n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`);
  switch (rule.freq) {
    case "daily":
      return every("day");
    case "weekly":
      return rule.byWeekday?.length
        ? `${every("week")} on ${rule.byWeekday.map((d) => WEEKDAYS[d]).join(", ")}`
        : every("week");
    case "monthly":
      return every("month");
    case "yearly":
      return every("year");
  }
}

/** Parses the recurrence fields used by forms: repeat=none|daily|weekly|monthly|yearly, repeatEvery, repeatDays (multi), repeatUntil */
export function recurrenceFromForm(form: FormData): Recurrence | null {
  const freq = String(form.get("repeat") ?? "none");
  if (!["daily", "weekly", "monthly", "yearly"].includes(freq)) return null;
  const interval = Math.max(1, Number(form.get("repeatEvery") || 1));
  const byWeekday = form
    .getAll("repeatDays")
    .map((v) => Number(v))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const until = String(form.get("repeatUntil") ?? "") || null;
  return { freq: freq as Recurrence["freq"], interval, byWeekday: freq === "weekly" ? byWeekday : undefined, until };
}
