// Small local-time date helpers. Dates are stored as UTC ISO strings; the day
// boundaries a person actually cares about ("today", "tomorrow") are local,
// so every helper here works in the device's local timezone unless noted
// otherwise.

/** Minutes east of UTC, e.g. +330 for India, -300 for US Eastern (standard time). */
export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Formats a Date as a local `YYYY-MM-DD` string. */
export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's date as a local `YYYY-MM-DD` string. */
export function todayKey(): string {
  return toLocalDateKey(new Date());
}

/** Shifts a `YYYY-MM-DD` key by `days` (may be negative), preserving local time. */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return toLocalDateKey(date);
}

/** True if the ISO timestamp falls on the local calendar day identified by `key`. */
export function isOnLocalDay(iso: string, key: string): boolean {
  return toLocalDateKey(new Date(iso)) === key;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Human display for a date key: "Today", "Tomorrow", "Yesterday", or "Mon, Aug 25". */
export function formatDateKeyDisplay(key: string): string {
  const today = todayKey();
  if (key === today) return 'Today';
  if (key === shiftDateKey(today, 1)) return 'Tomorrow';
  if (key === shiftDateKey(today, -1)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** Formats an ISO timestamp as a local time, e.g. "9:30 AM". */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${pad(minutes)} ${suffix}`;
}

/** Formats an ISO timestamp as a local date + time, e.g. "Aug 25, 9:30 AM". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${formatTime(iso)}`;
}
