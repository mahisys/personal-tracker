import "server-only";
import { getCashForecast } from "@/server/planner/forecast";
import { formatDay } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { raiseOnce } from "../helpers";
import { numConfig } from "../meta";
import type { Rule } from "../types";

export type ForecastLike = {
  lowest: { date: string; balancePaise: number };
  shortfall: null | { firstDate: string; amountPaise: number };
  suggestions: { billId: string; title: string; amountPaise: number; fromDate: string; toDate: string }[];
};

/** A once-a-day warning when the forecast shows a shortfall, listing payments that could move. */
export function decideCashWarning(f: ForecastLike, today: string, days: number): { dedupeKey: string; title: string; body: string } | null {
  if (!f.shortfall) return null;
  const s = f.shortfall;
  const lines = f.suggestions
    .slice(0, 4)
    .map((x) => `• Move ${x.title} (${formatINR(x.amountPaise)}) from ${formatDay(x.fromDate, { short: true })} to ${formatDay(x.toDate, { short: true })}`);
  const body = [
    `Within ${days} days your balance could fall ${formatINR(s.amountPaise)} short on ${formatDay(s.firstDate)} (lowest ${formatINR(f.lowest.balancePaise)} on ${formatDay(f.lowest.date, { short: true })}).`,
    lines.length ? `Ideas:\n${lines.join("\n")}` : "Consider chasing receivables or moving a flexible payment.",
  ].join("\n");
  return { dedupeKey: `cash_warning:${today}`, title: `Heads-up: cash may run short on ${formatDay(s.firstDate, { short: true })}`, body };
}

export const cashWarning: Rule = {
  key: "cash_warning",
  async run({ today, config }) {
    const days = numConfig(config, "days", 30, 7, 120);
    const f = await getCashForecast({ days, today });
    const w = decideCashWarning(f, today, days);
    if (!w) return { notifications: 0, note: "No shortfall ahead" };
    const raised = await raiseOnce({ kind: "cash_warning", ...w, link: "/planner" });
    return { notifications: raised ? 1 : 0, note: `Shortfall on ${f.shortfall!.firstDate}` };
  },
};
