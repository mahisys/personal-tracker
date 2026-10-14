"use client";
import { useState } from "react";
import Link from "next/link";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { cn } from "@/lib/cn";
import { LinkChip } from "./link-chip";
import type { TaskView } from "./meta";
import { SnoozeButton } from "./snooze-button";
import { DueChip, EffortChip, EtaChip, PriorityPill, RepeatIcon, SubtaskChip } from "./task-bits";
import { TaskCheck } from "./task-check";

export function TaskRow({ task, today, showWorkspace = true, showProject = true }: { task: TaskView; today: string; showWorkspace?: boolean; showProject?: boolean }) {
  const [done, setDone] = useState(task.status === "done");
  const canSnooze = !done && task.status !== "done" && task.dueDate != null && task.dueDate <= today;
  return (
    <div className={cn("group relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-brand-soft/50", done && "opacity-70")}>
      <div className="relative z-10 pt-0.5">
        <TaskCheck id={task.id} done={task.status === "done"} priority={task.priority} onChange={setDone} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Link
            href={`/tasks/${task.id}`}
            className={cn(
              "min-w-0 flex-1 text-[15px] font-semibold leading-snug text-fg transition-colors after:absolute after:inset-0 hover:text-brand",
              done && "text-fg-subtle line-through decoration-emerald-500/60 decoration-2",
            )}
          >
            {task.title}
          </Link>
          <PriorityPill priority={task.priority} className="relative mt-0.5" />
        </div>
        <div className="relative mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <DueChip dueDate={task.dueDate} dueTime={task.dueTime} today={today} done={done} />
          {task.status === "doing" ? <span className="text-xs font-bold text-brand">In progress</span> : null}
          {task.status === "waiting" ? <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Waiting</span> : null}
          {showProject && task.projectName ? (
            <Link href={`/projects/${task.projectId}`} className="max-w-[12rem] truncate text-xs font-medium text-fg-muted hover:text-brand">
              {task.projectName}
            </Link>
          ) : null}
          <EffortChip estimate={task.estimateMinutes} actual={task.actualMinutes} />
          <SubtaskChip done={task.subtaskDone} total={task.subtaskTotal} />
          <RepeatIcon show={task.recurring} />
          {!done ? <EtaChip etaDate={task.etaDate} late={task.etaLate} today={today} /> : null}
          {task.linkedType && task.linkedId ? <LinkChip type={task.linkedType} id={task.linkedId} label={task.linkedLabel} /> : null}
          {task.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-xs font-medium text-fg-subtle">
              #{t}
            </span>
          ))}
          {showWorkspace ? <WorkspaceBadge ws={task.workspace} /> : null}
        </div>
      </div>
      {canSnooze ? <SnoozeButton id={task.id} compact className="relative -mr-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" /> : null}
    </div>
  );
}
