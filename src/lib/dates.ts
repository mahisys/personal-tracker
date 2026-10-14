/**
 * Date helpers. The app runs in India Standard Time (UTC+05:30, no DST); servers run in UTC,
 * so "today" and calendar days must always be computed in IST, never with the server's local time.
 * Calendar days are "YYYY-MM-DD" strings.
 */
export const APP_TZ = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;

/** IST calendar day of an instant. */
export function toISTDate(d: Date = new Date()): string {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function todayIST(now: Date = new Date()): string {
  return toISTDate(now);
}

/** The instant at which an IST calendar day (optionally at HH:MM) begins. */
export function istToInstant(day: string, time: string = "00:00"): Date {
  const [h, m] = time.split(":").map(Number);
  const utc = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m);
  return new Date(utc - IST_OFFSET_MIN * 60_000);
}

/** "HH:MM" IST time of an instant. */
export function toISTTime(d: Date): string {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(11, 16);
}

/** Value for <input type="datetime-local"> in IST. */
export function toDateTimeLocalIST(d: Date | null | undefined): string {
  if (!d) return "";
  return `${toISTDate(d)}T${toISTTime(d)}`;
}

/** Parses "YYYY-MM-DDTHH:MM" (from datetime-local, interpreted as IST). */
export function fromDateTimeLocalIST(v: string | null | undefined): Date | null {
  if (!v) return null;
  const [d, t] = v.split("T");
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return istToInstant(d, t?.slice(0, 5) || "00:00");
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Adds months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(day: string, n: number, anchorDay?: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1;
  const dd = anchorDay ?? Number(day.slice(8, 10));
  const target = new Date(Date.UTC(y, m + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(dd, last));
  return target.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonth(day: string): string {
  return addDays(addMonths(startOfMonth(day), 1), -1);
}

/** Indian financial year (April–March) containing the day, e.g. "2026-10-14" → { start: "2026-04-01", end: "2027-03-31", label: "FY 2026-27" } */
export function financialYear(day: string): { start: string; end: string; label: string } {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const startYear = m >= 4 ? y : y - 1;
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    label: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Oct 2026" (or "14 Oct" when it is the current year and short is set). */
export function formatDay(day: string | null | undefined, opts: { short?: boolean; now?: Date } = {}): string {
  if (!day) return "—";
  const y = day.slice(0, 4);
  const label = `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
  if (opts.short && y === todayIST(opts.now).slice(0, 4)) return label;
  return `${label} ${y}`;
}

/** "14 Oct, 9:30 am" in IST. */
export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const t = toISTTime(d);
  const [h, m] = t.split(":").map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${formatDay(toISTDate(d), { short: true })}, ${hh}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** "Today", "Tomorrow", "Yesterday", "in 3 days", "5 days ago". */
export function relativeDay(day: string, today: string = todayIST()): string {
  const n = diffDays(today, day);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function formatMonth(key: string): string {
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
