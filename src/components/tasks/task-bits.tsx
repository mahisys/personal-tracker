/** Small presentational pieces shared by list rows, board cards and the Today page. Server-safe. */
import { CalendarDays, Clock, ListChecks, Repeat, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDay, formatMinutes, relativeDay } from "@/lib/dates";
import { priorityMeta } from "./meta";

export function PriorityPill({ priority, always, className }: { priority: number; always?: boolean; className?: string }) {
  if (!always && priority >= 3) return null;
  const m = priorityMeta(priority);
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide", m.className, className)}>{m.short}</span>;
}

export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function DueChip({ dueDate, dueTime, today, done, className }: { dueDate: string | null; dueTime?: string | null; today: string; done?: boolean; className?: string }) {
  if (!dueDate) return null;
  const overdue = !done && dueDate < today;
  const isToday = dueDate === today;
  const near = dueDate > today && dueDate <= addDaysStr(today, 6);
  const label = overdue || isToday || dueDate === addDaysStr(today, 1) ? relativeDay(dueDate, today) : near ? weekdayName(dueDate) : formatDay(dueDate, { short: true });
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold",
        done ? "text-fg-subtle" : overdue ? "text-rose-600 dark:text-rose-300" : isToday ? "text-amber-700 dark:text-amber-300" : "text-fg-muted",
        className,
      )}
    >
      <CalendarDays className="h-3.5 w-3.5" />
      {label}
      {dueTime ? <span className="font-medium opacity-80">· {formatTime12(dueTime)}</span> : null}
    </span>
  );
}

export function EffortChip({ estimate, actual }: { estimate: number | null; actual: number }) {
  if (!estimate && !actual) return null;
  const over = estimate != null && actual > estimate;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", over ? "text-amber-700 dark:text-amber-300" : "text-fg-subtle")}>
      <Clock className="h-3.5 w-3.5" />
      {actual ? `${formatMinutes(actual)}${estimate ? ` / ${formatMinutes(estimate)}` : ""}` : `~${formatMinutes(estimate)}`}
    </span>
  );
}

export function SubtaskChip({ done, total }: { done: number; total: number }) {
  if (!total) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", done === total ? "text-emerald-600 dark:text-emerald-300" : "text-fg-subtle")}>
      <ListChecks className="h-3.5 w-3.5" />
      {done}/{total}
    </span>
  );
}

export function RepeatIcon({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span title="Repeats" className="inline-flex text-fg-subtle">
      <Repeat className="h-3.5 w-3.5" />
    </span>
  );
}

export function EtaChip({ etaDate, late, today }: { etaDate?: string | null; late?: boolean; today: string }) {
  if (!etaDate || etaDate === today) return null;
  return (
    <span title="Projected finish based on your estimates and daily hours" className={cn("inline-flex items-center gap-1 text-xs font-medium", late ? "text-rose-600 dark:text-rose-300" : "text-fg-subtle")}>
      <TrendingUp className="h-3.5 w-3.5" />
      ETA {formatDay(etaDate, { short: true })}
    </span>
  );
}

function addDaysStr(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekdayName(day: string) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${day}T00:00:00Z`).getUTCDay()];
}
