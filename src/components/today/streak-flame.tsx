"use client";
import { motion } from "motion/react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/cn";

/** Streak pill with a gently flickering flame (still when the streak is waiting for today's first win). */
export function StreakFlame({ days, active, hint }: { days: number; active: boolean; hint: string }) {
  const lit = days > 0;
  return (
    <span
      title={hint}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold ring-1 ring-inset",
        lit ? "bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-300" : "bg-muted text-fg-muted ring-line-strong",
      )}
    >
      <motion.span
        className="inline-flex"
        animate={lit && active ? { rotate: [-6, 6, -4, 5, -6], scale: [1, 1.12, 1, 1.08, 1] } : undefined}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Flame className={cn("h-4 w-4", lit && "fill-amber-400 text-amber-500")} />
      </motion.span>
      {lit ? (
        <span>
          <span className="tabular-nums">{days}</span>-day streak
        </span>
      ) : (
        "Start a streak"
      )}
      <span className="hidden text-xs font-semibold opacity-75 sm:inline">· {hint}</span>
    </span>
  );
}
