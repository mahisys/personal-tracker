import { Lightbulb, Sparkles } from "lucide-react";
import { accuracyInsight, MIN_SAMPLES, type Accuracy } from "@/server/tasks/accuracy";
import { cn } from "@/lib/cn";

/** "You usually take 1.3× your estimate for development" — a small, friendly nudge. */
export function EstimateInsight({ accuracy, className }: { accuracy: Accuracy; className?: string }) {
  const ins = accuracyInsight(accuracy);
  const tone = ins?.tone ?? "info";
  const iconTone = {
    good: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
    warn: "bg-amber-500/14 text-amber-600 dark:text-amber-300",
    info: "bg-sky-500/12 text-sky-600 dark:text-sky-300",
  }[tone];
  const needed = Math.max(0, MIN_SAMPLES - (accuracy.overall?.count ?? 0));
  return (
    <div className={cn("glass relative flex items-start gap-3 overflow-hidden rounded-[var(--radius-card)] border border-line p-4 shadow-card", className)}>
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br from-violet-500/15 to-transparent blur-2xl" />
      <div className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", ins ? iconTone : "bg-brand-soft text-brand")}>
        {ins ? <Lightbulb className="h-4.5 w-4.5" /> : <Sparkles className="h-4.5 w-4.5" />}
      </div>
      <div className="relative min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-subtle">Estimate insight</div>
        {ins ? (
          <>
            <p className="mt-0.5 text-sm font-bold text-fg">{ins.headline}</p>
            <p className="text-xs text-fg-muted">{ins.detail}</p>
          </>
        ) : (
          <>
            <p className="mt-0.5 text-sm font-bold text-fg">Learning how long things take</p>
            <p className="text-xs text-fg-muted">
              {needed > 0
                ? `Estimate a task, track its time and finish it — ${needed} more and you'll see how accurate your estimates are.`
                : "Add a type (like “development”) to tasks to see accuracy per kind of work."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
