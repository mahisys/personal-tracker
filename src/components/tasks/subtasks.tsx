"use client";
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { addSubtask } from "@/server/tasks/actions";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Progress } from "@/components/ui/stat";
import { cn } from "@/lib/cn";
import type { TaskView } from "./meta";
import { EffortChip } from "./task-bits";
import { TaskCheck } from "./task-check";

/** Checklist of steps under a task, with inline add. */
export function Subtasks({ parentId, items }: { parentId: string; items: TaskView[] }) {
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const isDone = (t: TaskView) => doneMap[t.id] ?? t.status === "done";
  const doneCount = items.filter(isDone).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  return (
    <div>
      {items.length > 0 ? (
        <div className="mb-3 flex items-center gap-3">
          <Progress value={pct} tone={pct === 100 ? "good" : "brand"} className="flex-1" />
          <span className="text-xs font-bold tabular-nums text-fg-muted">
            {doneCount}/{items.length}
          </span>
        </div>
      ) : null}
      <ul className="space-y-1">
        <AnimatePresence initial={false}>
          {items.map((s) => (
            <motion.li
              key={s.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60"
            >
              <TaskCheck id={s.id} done={s.status === "done"} size="sm" onChange={(d) => setDoneMap((m) => ({ ...m, [s.id]: d }))} />
              <Link href={`/tasks/${s.id}`} className={cn("min-w-0 flex-1 truncate text-sm font-medium text-fg hover:text-brand", isDone(s) && "text-fg-subtle line-through")}>
                {s.title}
              </Link>
              <EffortChip estimate={s.estimateMinutes} actual={s.actualMinutes} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <ActionForm action={addSubtask} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="parentId" value={parentId} />
        <div className="relative flex-1">
          <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            name="title"
            placeholder={items.length ? "Add another step" : "Break it into small steps"}
            className="h-10 w-full rounded-xl border border-dashed border-line-strong bg-transparent pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle transition focus:border-brand focus:bg-solid focus:outline-none focus:ring-4 focus:ring-brand/15"
            autoComplete="off"
          />
        </div>
        <SubmitButton size="sm" variant="soft" className="h-10">
          Add
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
