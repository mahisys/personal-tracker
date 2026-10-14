import { CheckCircle2, Plus } from "lucide-react";
import type { Streak } from "@/server/today/streak";
import { streakLine } from "@/server/today/streak";
import { ProgressRing } from "@/components/ui/stat";
import { LinkButton } from "@/components/ui/button";
import { StreakFlame } from "./streak-flame";
import { longDate } from "./greeting";

export function TodayHero({
  greeting,
  emoji,
  today,
  line,
  progress,
  streak,
}: {
  greeting: string;
  emoji: string;
  today: string;
  line: string;
  progress: { done: number; open: number; percent: number };
  streak: Streak;
}) {
  const total = progress.done + progress.open;
  return (
    <section className="glass relative mb-6 overflow-hidden rounded-[28px] border border-line p-6 shadow-card animate-fade-up sm:p-8">
      {/* soft aurora wash */}
      <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl animate-float" />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-64 w-72 rounded-full bg-emerald-400/15 blur-3xl animate-float [animation-delay:-6s]" />
      <div className="pointer-events-none absolute right-1/3 top-0 h-40 w-40 rounded-full bg-sky-400/15 blur-3xl animate-float [animation-delay:-12s]" />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-fg-muted">{longDate(today)}</div>
          <h1 className="mt-2 text-[32px] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            <span className="text-gradient">{greeting}</span> <span className="inline-block animate-pop-in [animation-delay:200ms]">{emoji}</span>
          </h1>
          <p className="mt-3 max-w-xl text-base font-medium text-fg-muted sm:text-lg">{line}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <StreakFlame days={streak.days} active={streak.activeToday} hint={streakLine(streak)} />
            {progress.done > 0 ? (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 text-sm font-bold text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> {progress.done} done today
              </span>
            ) : null}
            <LinkButton href="/tasks?new=1" variant="secondary" size="sm" className="h-9 rounded-full px-3.5">
              <Plus className="h-4 w-4" /> Task
            </LinkButton>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 self-start sm:flex-col sm:self-center">
          <ProgressRing value={progress.percent} size={128} stroke={12} label={<span className="text-2xl">{total ? `${progress.percent}%` : "—"}</span>} sub={total ? `${progress.done} of ${total}` : "nothing due"} />
          <div className="text-sm font-semibold text-fg-muted sm:text-center">
            {total === 0 ? "No tasks due today" : progress.open === 0 ? "Today's list: done!" : "of today's tasks"}
          </div>
        </div>
      </div>
    </section>
  );
}
