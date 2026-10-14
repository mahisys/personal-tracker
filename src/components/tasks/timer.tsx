"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, Square, Timer } from "lucide-react";
import { startTimer, stopTimer } from "@/server/tasks/actions";
import type { RunningTimer } from "@/server/tasks/queries";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatMinutes } from "@/lib/dates";
import { handleResult } from "./events";

function useElapsed(startedAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
}

export function formatClock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Floating pill showing the one running timer, with a stop button. Hidden on that task's own page. */
export function RunningTimerPill({ timer }: { timer: RunningTimer }) {
  const pathname = usePathname();
  const elapsed = useElapsed(timer?.startedAt ?? null);
  const [pending, start] = useTransition();
  const hidden = !timer || pathname === `/tasks/${timer.taskId}`;
  return (
    <AnimatePresence>
      {!hidden && timer ? (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0"
        >
          <div className="glass flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-line py-1.5 pl-2 pr-1.5 shadow-pop">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] text-white">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand/30" />
              <Timer className="relative h-4 w-4" />
            </span>
            <Link href={`/tasks/${timer.taskId}`} className="min-w-0">
              <div className="truncate text-xs font-semibold text-fg-muted">{timer.title}</div>
              <div className="font-mono text-sm font-bold tabular-nums text-fg">{formatClock(elapsed)}</div>
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => void handleResult(await stopTimer()))}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-rose-500/10 px-3 text-xs font-bold text-rose-600 transition hover:bg-rose-500 hover:text-white dark:text-rose-300"
              aria-label="Stop timer"
            >
              <Square className="h-3.5 w-3.5 fill-current" /> Stop
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Big start/stop control for a task's detail page. */
export function TimerControl({ taskId, running, loggedMinutes }: { taskId: string; running: RunningTimer; loggedMinutes: number }) {
  const mine = running?.taskId === taskId;
  const elapsed = useElapsed(mine ? running!.startedAt : null);
  const [pending, start] = useTransition();
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl border p-4 transition-colors", mine ? "border-brand/30 bg-brand-soft" : "border-line bg-solid/50")}>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{mine ? "Timer running" : running ? "Another timer is running" : "Focus timer"}</div>
        <div className={cn("font-extrabold tabular-nums text-fg", mine ? "font-mono text-2xl" : "text-lg")}>
          {mine ? formatClock(elapsed) : loggedMinutes ? `${formatMinutes(loggedMinutes)} logged` : "Ready when you are"}
        </div>
        {!mine && running ? <div className="truncate text-xs text-fg-subtle">Starting here stops “{running.title}”</div> : null}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => void handleResult(mine ? await stopTimer() : await startTimer(taskId)))}
        className={buttonClass(mine ? "danger" : "primary", "lg", "rounded-full px-5")}
      >
        {mine ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
        {mine ? "Stop" : "Start"}
      </button>
    </div>
  );
}
