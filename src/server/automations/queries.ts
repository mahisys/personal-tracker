import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { automationRules, automationRuns } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { describeOutcome, ensureRules } from "./engine";
import { mergeConfig, RULE_META, RULES } from "./meta";
import type { RuleResult } from "./types";

export async function getRulesForPage() {
  await ensureRules();
  const rows = await db.select().from(automationRules);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return RULES.map((meta) => {
    const r = byKey.get(meta.key);
    return {
      meta,
      enabled: r?.enabled ?? true,
      config: mergeConfig(meta.key, r?.config),
      lastRunLabel: r?.lastRunAt ? formatDateTime(r.lastRunAt) : null,
      lastResult: r?.lastResult ?? null,
      lastError: Boolean(r?.lastResult?.startsWith("Error")),
    };
  });
}

type StoredResults = {
  rules?: RuleResult[];
  disabled?: string[];
  push?: { notifications?: number; sent?: number; skipped?: string; error?: string };
};

export async function getRecentRuns(limit = 30) {
  const dayAgo = Date.now() - 24 * 3600_000;
  const runs = await db.select().from(automationRuns).orderBy(desc(automationRuns.startedAt)).limit(limit);
  return runs.map((run) => {
    const res = (run.results ?? {}) as StoredResults;
    const rules = res.rules ?? [];
    const ms = run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null;
    const push = res.push;
    return {
      id: run.id,
      trigger: run.trigger,
      startedLabel: formatDateTime(run.startedAt),
      /** Started within the last 24 hours */
      recent: run.startedAt.getTime() > dayAgo,
      duration: ms == null ? null : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`,
      ok: run.ok,
      alerts: rules.reduce((s, r) => s + (r.notifications ?? 0), 0),
      tasks: rules.reduce((s, r) => s + (r.tasks ?? 0), 0),
      pushLabel: push
        ? push.error
          ? `failed (${push.error})`
          : push.skipped
            ? push.skipped
            : push.notifications
              ? `${push.notifications} alert${push.notifications === 1 ? "" : "s"} → ${push.sent ?? 0} delivered`
              : "nothing new"
        : null,
      rules: rules.map((r) => ({ key: r.key, name: RULE_META[r.key]?.name ?? r.key, ok: r.ok, summary: describeOutcome(r), ms: r.ms })),
      disabled: (res.disabled ?? []).map((k) => RULE_META[k as keyof typeof RULE_META]?.name ?? k),
    };
  });
}
