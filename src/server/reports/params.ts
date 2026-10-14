import { addMonths, formatMonth, todayIST } from "@/lib/dates";
import { fyRange, fyStartYear } from "./aggregate";

/** ?fy=2026 → 2026 (FY 2026-27); defaults to the current FY. */
export function parseFy(v: string | undefined, today = todayIST()): number {
  const cur = fyStartYear(today);
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= cur ? n : cur;
}

/** ?month=2026-10 → "2026-10"; defaults to the current month. */
export function parseMonth(v: string | undefined, today = todayIST()): string {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && v <= today.slice(0, 7) ? v : today.slice(0, 7);
}

export function fyOptions(years: number[]) {
  return years.map((y) => ({ value: String(y), label: fyRange(y).label }));
}

/** The last 18 months, newest first. */
export function monthOptions(today = todayIST(), count = 18) {
  return Array.from({ length: count }, (_, i) => {
    const m = addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7);
    return { value: m, label: formatMonth(m) };
  });
}

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthShort = (key: string) => MONTH_SHORT[Number(key.slice(5, 7)) - 1];
