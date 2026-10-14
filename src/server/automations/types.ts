import type { AppSettings } from "@/server/settings";
import type { RuleKey } from "./meta";

export type RuleContext = {
  now: Date;
  /** IST calendar day */
  today: string;
  /** IST "HH:MM" */
  time: string;
  trigger: string;
  settings: AppSettings;
  config: Record<string, unknown>;
};

export type RuleOutcome = {
  notifications: number;
  tasks?: number;
  emails?: number;
  created?: number;
  skipped?: string;
  note?: string;
};

export type RuleResult = RuleOutcome & { key: RuleKey; ok: boolean; error?: string; ms: number };

export type Rule = {
  key: RuleKey;
  run: (ctx: RuleContext) => Promise<RuleOutcome>;
};

export const OPEN_TASK_STATUSES = ["todo", "doing", "waiting"] as const;

/** Monday (IST) of the week containing the day — used for once-a-week dedupe keys. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = d.getUTCDay(); // 0 = Sun
  const back = (wd + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** True once the IST clock has reached "HH:MM". */
export function isAtOrAfter(time: string, at: string): boolean {
  return time >= normaliseTime(at);
}

export function normaliseTime(t: string | null | undefined, fallback = "08:00"): string {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return fallback;
  const [h, m] = t.split(":").map(Number);
  if (h > 23 || m > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
