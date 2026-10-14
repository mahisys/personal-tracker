import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { automationRules, automationRuns, settings as settingsTable } from "@/db/schema";
import { todayIST, toISTTime } from "@/lib/dates";
import { DEFAULT_SETTINGS, type AppSettings } from "@/server/settings";
import { deliverPendingPush } from "@/server/messaging/push";
import { mergeConfig, RULES, type RuleKey } from "./meta";
import type { Rule, RuleOutcome, RuleResult } from "./types";
import { billReminders } from "./rules/bill-reminders";
import { leadFollowups, staleLeads } from "./rules/leads";
import { invoiceOverdue } from "./rules/invoices";
import { dsaStaleFiles, payoutChase } from "./rules/dsa";
import { cashWarning } from "./rules/cash-warning";
import { renewalsRule } from "./rules/renewals";
import { dailyDigest } from "./rules/digest";
import { weeklyReview } from "./rules/weekly";
import { recurringCatchup } from "./rules/recurring";
import { taskReminders } from "./rules/task-reminders";

/** Order matters a little: tasks are created before the digest summarises them, and catch-up runs first. */
export const RULE_IMPLS: Record<RuleKey, Rule> = {
  recurring_catchup: recurringCatchup,
  task_reminders: taskReminders,
  bill_reminders: billReminders,
  lead_followups: leadFollowups,
  stale_leads: staleLeads,
  invoice_overdue: invoiceOverdue,
  dsa_stale_files: dsaStaleFiles,
  payout_chase: payoutChase,
  cash_warning: cashWarning,
  renewals: renewalsRule,
  daily_digest: dailyDigest,
  weekly_review: weeklyReview,
};

const RUN_ORDER = Object.keys(RULE_IMPLS) as RuleKey[];

/** Inserts a row for every rule that does not have one yet (enabled, default config). */
export async function ensureRules() {
  await db
    .insert(automationRules)
    .values(RULES.map((r) => ({ key: r.key, enabled: true, config: r.defaultConfig })))
    .onConflictDoNothing({ target: automationRules.key });
}

/** Settings read fresh (not request-cached), merged over defaults. */
export async function loadSettingsFresh(): Promise<AppSettings> {
  const rows = await db.select().from(settingsTable);
  const out = structuredClone(DEFAULT_SETTINGS) as AppSettings;
  for (const r of rows) {
    if (r.key in out) {
      const k = r.key as keyof AppSettings;
      out[k] = { ...out[k], ...(r.value as object) } as never;
    }
  }
  return out;
}

/** "2 alerts · 1 task" style one-liner stored as lastResult. */
export function describeOutcome(o: RuleOutcome & { ok?: boolean; error?: string }): string {
  if (o.error) return `Error: ${o.error}`;
  const bits: string[] = [];
  if (o.notifications) bits.push(`${o.notifications} alert${o.notifications === 1 ? "" : "s"}`);
  if (o.tasks) bits.push(`${o.tasks} task${o.tasks === 1 ? "" : "s"}`);
  if (o.emails) bits.push(`${o.emails} email${o.emails === 1 ? "" : "s"}`);
  if (o.created && !o.notifications) bits.push(`${o.created} created`);
  if (bits.length) return bits.join(" · ");
  return o.skipped ?? "All quiet — nothing needed";
}

export type RunSummary = {
  runId: string;
  ok: boolean;
  trigger: string;
  today: string;
  time: string;
  rules: RuleResult[];
  disabled: RuleKey[];
  push: Awaited<ReturnType<typeof deliverPendingPush>> | { error: string };
  ms: number;
};

/**
 * Runs every enabled automation rule once. Safe to call every 15 minutes: every alert and task is
 * guarded by a dedupe key (item id + IST day / occurrence), so repeated runs never duplicate anything.
 * One failing rule never stops the others. Ends by pushing any alerts not yet pushed.
 */
export async function runAutomations(opts: { now?: Date; trigger?: string; only?: RuleKey[] } = {}): Promise<RunSummary> {
  const now = opts.now ?? new Date();
  const trigger = opts.trigger ?? "cron";
  const started = Date.now();
  await ensureRules();
  const settings = await loadSettingsFresh();
  const rows = await db.select().from(automationRules);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const [run] = await db.insert(automationRuns).values({ trigger }).returning({ id: automationRuns.id });

  const today = todayIST(now);
  const time = toISTTime(now);
  const results: RuleResult[] = [];
  const disabled: RuleKey[] = [];

  for (const key of RUN_ORDER) {
    if (opts.only && !opts.only.includes(key)) continue;
    const row = byKey.get(key);
    if (row && !row.enabled) {
      disabled.push(key);
      continue;
    }
    const t0 = Date.now();
    let result: RuleResult;
    try {
      const outcome = await RULE_IMPLS[key].run({ now, today, time, trigger, settings, config: mergeConfig(key, row?.config) });
      result = { key, ok: true, ms: Date.now() - t0, ...outcome };
    } catch (e) {
      console.error(`[automations] rule ${key} failed`, e);
      result = { key, ok: false, ms: Date.now() - t0, notifications: 0, error: e instanceof Error ? e.message : String(e) };
    }
    results.push(result);
    await db
      .update(automationRules)
      .set({ lastRunAt: new Date(), lastResult: describeOutcome(result).slice(0, 500) })
      .where(eq(automationRules.key, key))
      .catch((e) => console.error("[automations] could not record lastResult", e));
  }

  let push: RunSummary["push"];
  try {
    push = await deliverPendingPush({ pushEnabled: settings.notifications.pushEnabled, now: new Date() });
  } catch (e) {
    push = { error: e instanceof Error ? e.message : String(e) };
  }

  const ok = results.every((r) => r.ok) && !("error" in push && push.error);
  await db.update(automationRuns).set({ finishedAt: new Date(), ok, results: { today, time, rules: results, disabled, push } }).where(eq(automationRuns.id, run.id));
  return { runId: run.id, ok, trigger, today, time, rules: results, disabled, push, ms: Date.now() - started };
}
