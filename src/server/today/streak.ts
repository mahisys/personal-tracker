/**
 * Completion streak (pure): consecutive IST days, ending today, with at least one task completed.
 * If nothing is done yet today the streak is still alive from yesterday — it only breaks once a
 * whole day passes with nothing completed.
 */
import { addDays } from "@/lib/dates";

export type Streak = {
  /** Consecutive days with ≥1 completion */
  days: number;
  /** Whether today already counts */
  activeToday: boolean;
  /** Longest run found in the supplied days */
  best: number;
};

export function computeStreak(completedDays: Iterable<string>, today: string): Streak {
  const set = new Set(completedDays);
  const activeToday = set.has(today);
  let days = 0;
  let d = activeToday ? today : addDays(today, -1);
  while (set.has(d)) {
    days++;
    d = addDays(d, -1);
  }
  // Longest run
  let best = 0;
  for (const day of set) {
    if (set.has(addDays(day, -1))) continue; // not the start of a run
    let len = 0;
    let cur = day;
    while (set.has(cur)) {
      len++;
      cur = addDays(cur, 1);
    }
    best = Math.max(best, len);
  }
  return { days, activeToday, best };
}

/** A short line to go with the streak number. */
export function streakLine(s: Streak): string {
  if (s.days === 0) return "Finish one task to start a streak";
  if (!s.activeToday) return "Finish a task today to keep it going";
  if (s.days >= s.best && s.days >= 3) return "Your best run yet — keep it up!";
  if (s.days === 1) return "Day one — nice start";
  return "You're on a roll";
}
