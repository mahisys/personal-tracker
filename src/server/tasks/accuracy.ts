/**
 * Estimate accuracy (pure). How long things really take compared with what you planned.
 * Ratio = total actual minutes ÷ total estimated minutes, so long tasks weigh more than tiny ones.
 */

export type AccuracySample = {
  taskType?: string | null;
  estimateMinutes: number | null;
  actualMinutes: number | null;
};

export type AccuracyStat = { ratio: number; count: number; estimateMinutes: number; actualMinutes: number };

export type Accuracy = {
  overall: AccuracyStat | null;
  /** Sorted by number of samples, most first */
  byType: (AccuracyStat & { taskType: string })[];
};

/** Minimum completed tasks before we trust a ratio enough to talk about it or use it for ETAs. */
export const MIN_SAMPLES = 3;

function stat(samples: { e: number; a: number }[]): AccuracyStat | null {
  if (samples.length === 0) return null;
  const e = samples.reduce((s, x) => s + x.e, 0);
  const a = samples.reduce((s, x) => s + x.a, 0);
  if (e <= 0) return null;
  return { ratio: a / e, count: samples.length, estimateMinutes: e, actualMinutes: a };
}

/** Only samples with both a positive estimate and some logged time count. */
export function computeAccuracy(samples: AccuracySample[]): Accuracy {
  const valid = samples
    .filter((s) => (s.estimateMinutes ?? 0) > 0 && (s.actualMinutes ?? 0) > 0)
    .map((s) => ({ type: normaliseType(s.taskType), e: s.estimateMinutes!, a: s.actualMinutes! }));
  const groups = new Map<string, { e: number; a: number }[]>();
  for (const s of valid) {
    if (!s.type) continue;
    const g = groups.get(s.type) ?? [];
    g.push(s);
    groups.set(s.type, g);
  }
  const byType = [...groups.entries()]
    .map(([taskType, g]) => ({ taskType, ...stat(g)! }))
    .sort((x, y) => y.count - x.count || x.taskType.localeCompare(y.taskType));
  return { overall: stat(valid), byType };
}

export function normaliseType(t: string | null | undefined): string | null {
  const s = (t ?? "").trim().toLowerCase();
  return s === "" ? null : s;
}

/** "1.3×" — one decimal, trailing ".0" kept off. */
export function formatRatio(r: number): string {
  const v = Math.round(r * 10) / 10;
  return `${v.toFixed(1).replace(/\.0$/, "")}×`;
}

/**
 * A short, friendly insight, or null when there is not enough data or nothing notable.
 * Prefers the task type with the most samples whose ratio is off by at least 10%.
 */
export function accuracyInsight(acc: Accuracy): { headline: string; detail: string; ratio: number; tone: "good" | "warn" | "info" } | null {
  const notable = (r: number) => Math.abs(r - 1) >= 0.1;
  const typed = acc.byType.find((t) => t.count >= MIN_SAMPLES && notable(t.ratio));
  const pick = typed ?? (acc.overall && acc.overall.count >= MIN_SAMPLES ? { ...acc.overall, taskType: null as string | null } : null);
  if (!pick) return null;
  const forWhat = pick.taskType ? ` for ${pick.taskType}` : "";
  const tasksWord = `${pick.count} finished task${pick.count === 1 ? "" : "s"}`;
  if (!notable(pick.ratio)) {
    return { headline: `Your estimates are spot on${forWhat}`, detail: `Based on ${tasksWord} — nicely calibrated.`, ratio: pick.ratio, tone: "good" };
  }
  if (pick.ratio > 1) {
    return {
      headline: `You usually take ${formatRatio(pick.ratio)} your estimate${forWhat}`,
      detail: `Based on ${tasksWord}. Padding new estimates a little keeps ETAs honest.`,
      ratio: pick.ratio,
      tone: "warn",
    };
  }
  return {
    headline: `You usually finish in ${formatRatio(pick.ratio)} your estimate${forWhat}`,
    detail: `Based on ${tasksWord}. You're quicker than you think!`,
    ratio: pick.ratio,
    tone: "info",
  };
}

/** Overrun factor to apply to ETAs: the overall ratio, clamped to a sane range, or 1 without enough data. */
export function etaFactor(acc: Accuracy): number {
  if (!acc.overall || acc.overall.count < MIN_SAMPLES) return 1;
  return Math.min(3, Math.max(0.5, acc.overall.ratio));
}
