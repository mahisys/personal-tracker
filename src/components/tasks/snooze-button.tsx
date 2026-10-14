"use client";
import { useTransition } from "react";
import { AlarmClock, Loader2 } from "lucide-react";
import { snoozeTask } from "@/server/tasks/actions";
import { cn } from "@/lib/cn";
import { handleResult } from "./events";

export function SnoozeButton({ id, className, compact }: { id: string; className?: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => void handleResult(await snoozeTask(id)));
      }}
      title="Snooze to tomorrow"
      aria-label="Snooze to tomorrow"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-fg-muted transition hover:bg-amber-500/12 hover:text-amber-700 dark:hover:text-amber-300",
        className,
      )}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlarmClock className="h-3.5 w-3.5" />}
      {compact ? null : <span>Tomorrow</span>}
    </button>
  );
}
