"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, CircleCheckBig } from "lucide-react";
import { groupByBucket, type Bucket } from "@/server/tasks/grouping";
import { cn } from "@/lib/cn";
import type { TaskView } from "./meta";
import { TaskRow } from "./task-row";

const BUCKET_STYLE: Record<Bucket, string> = {
  overdue: "text-rose-600 dark:text-rose-300",
  today: "text-amber-700 dark:text-amber-300",
  tomorrow: "text-brand",
  week: "text-fg-muted",
  later: "text-fg-muted",
  none: "text-fg-subtle",
};

export function TaskList({ tasks, done, today, showWorkspace = true }: { tasks: TaskView[]; done?: TaskView[]; today: string; showWorkspace?: boolean }) {
  const groups = groupByBucket(tasks, today);
  const [showDone, setShowDone] = useState(false);
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.bucket} className="animate-fade-up">
          <div className="mb-2 flex items-center gap-2 px-1">
            <h2 className={cn("text-xs font-extrabold uppercase tracking-[0.14em]", BUCKET_STYLE[g.bucket])}>{g.label}</h2>
            <span className="rounded-full bg-muted px-2 text-[11px] font-bold tabular-nums text-fg-muted">{g.items.length}</span>
          </div>
          <div className="glass overflow-hidden rounded-[var(--radius-card)] border border-line shadow-card">
            <AnimatePresence initial={false}>
              {g.items.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, transition: { duration: 0.28 } }}
                  className="border-b border-line last:border-0"
                >
                  <TaskRow task={t} today={today} showWorkspace={showWorkspace} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}

      {done && done.length > 0 ? (
        <section>
          <button
            type="button"
            onClick={() => setShowDone((s) => !s)}
            className="mb-2 flex items-center gap-2 rounded-lg px-1 text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-600 transition hover:text-emerald-500 dark:text-emerald-300"
            aria-expanded={showDone}
          >
            <CircleCheckBig className="h-4 w-4" />
            Done recently
            <span className="rounded-full bg-emerald-500/10 px-2 text-[11px] tabular-nums">{done.length}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", showDone && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {showDone ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="glass overflow-hidden rounded-[var(--radius-card)] border border-line shadow-card"
              >
                {done.map((t) => (
                  <div key={t.id} className="border-b border-line last:border-0">
                    <TaskRow task={t} today={today} showWorkspace={showWorkspace} />
                  </div>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>
      ) : null}
    </div>
  );
}
