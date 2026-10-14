/** Pure sales metrics. */
import { addMonths, diffDays, monthKey, toISTDate } from "@/lib/dates";

/** Won / (won + lost) as a 0–100 integer, or null when nothing closed. */
export function winRate(won: number, lost: number): number | null {
  const n = won + lost;
  return n === 0 ? null : Math.round((won / n) * 100);
}

export function averageDaysToClose(rows: { createdAt: Date; closedAt: Date | null }[]): number | null {
  const closed = rows.filter((r) => r.closedAt);
  if (!closed.length) return null;
  const total = closed.reduce((s, r) => s + Math.max(0, diffDays(toISTDate(r.createdAt), toISTDate(r.closedAt!))), 0);
  return Math.round(total / closed.length);
}

/** The last n month keys ending with the month of `today`, oldest first. */
export function lastMonths(today: string, n = 12): string[] {
  const start = `${today.slice(0, 7)}-01`;
  return Array.from({ length: n }, (_, i) => monthKey(addMonths(start, i - (n - 1))));
}

export function bucketByMonth(months: string[], rows: { day: string; paise: number }[]): number[] {
  const m = new Map(months.map((k) => [k, 0]));
  for (const r of rows) {
    const k = r.day.slice(0, 7);
    if (m.has(k)) m.set(k, m.get(k)! + r.paise);
  }
  return months.map((k) => m.get(k)!);
}

export function percentOf(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((value / target) * 100);
}
