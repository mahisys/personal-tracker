"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowRightLeft, Check, Inbox } from "lucide-react";
import type { TaskStatus } from "@/db/schema";
import { moveTask } from "@/server/tasks/actions";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { cn } from "@/lib/cn";
import { handleResult } from "./events";
import { LinkChip } from "./link-chip";
import { BOARD_COLUMNS, STATUS_META, type BoardColumn, type TaskView } from "./meta";
import { DueChip, EffortChip, PriorityPill, RepeatIcon, SubtaskChip } from "./task-bits";

const COLUMN_STYLE: Record<BoardColumn, { head: string; glow: string; empty: string }> = {
  todo: { head: "bg-slate-400", glow: "ring-slate-400/40", empty: "Nothing queued — enjoy the space" },
  doing: { head: "bg-violet-500", glow: "ring-violet-500/40", empty: "Drag something here to start" },
  waiting: { head: "bg-amber-500", glow: "ring-amber-500/40", empty: "Nothing blocked. Lovely." },
  done: { head: "bg-emerald-500", glow: "ring-emerald-500/40", empty: "Wins land here" },
};

/**
 * Kanban board. Drag cards between columns (mouse, pen) or use the "Move to" menu (touch, keyboard).
 * Moves are optimistic; moving into Done completes the task (confetti, recurrence, overrun prompt).
 */
export function TaskBoard({ tasks, today, showWorkspace = true, showProject = true }: { tasks: TaskView[]; today: string; showWorkspace?: boolean; showProject?: boolean }) {
  const [items, setItems] = useState(tasks);
  const [over, setOver] = useState<BoardColumn | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setItems(tasks), [tasks]);

  function move(id: string, to: BoardColumn) {
    const current = items.find((t) => t.id === id);
    if (!current || current.status === to) return;
    const before = items;
    setItems((list) => list.map((t) => (t.id === id ? { ...t, status: to as TaskStatus, completedAt: to === "done" ? new Date().toISOString() : null } : t)));
    start(async () => {
      const r = await moveTask(id, to);
      if (!handleResult(r)) setItems(before);
    });
  }

  return (
    <LayoutGroup>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {BOARD_COLUMNS.map((col) => {
          const list = items.filter((t) => t.status === col);
          const style = COLUMN_STYLE[col];
          return (
            <section
              key={col}
              aria-label={STATUS_META[col].label}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== col) setOver(col);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === col ? null : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/task-id") || dragging;
                setOver(null);
                setDragging(null);
                if (id) move(id, col);
              }}
              className={cn(
                "flex w-[82vw] max-w-[320px] shrink-0 snap-start flex-col rounded-[var(--radius-card)] border border-line bg-muted/50 p-2 transition-all duration-200 sm:w-[300px] lg:w-auto lg:max-w-none",
                over === col && cn("bg-brand-soft ring-2", style.glow),
              )}
            >
              <header className="flex items-center gap-2 px-2 pb-2 pt-1.5">
                <span className={cn("h-2 w-2 rounded-full", style.head)} />
                <h3 className="text-sm font-bold text-fg">{STATUS_META[col].label}</h3>
                <span className="ml-auto rounded-full bg-solid px-2 text-[11px] font-bold tabular-nums text-fg-muted">{list.length}</span>
              </header>
              <div className="flex min-h-24 flex-1 flex-col gap-2">
                <AnimatePresence initial={false} mode="popLayout">
                  {list.map((t) => (
                    <BoardCard
                      key={t.id}
                      task={t}
                      today={today}
                      showWorkspace={showWorkspace}
                      showProject={showProject}
                      dragging={dragging === t.id}
                      onDragStart={() => setDragging(t.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onMove={(to) => move(t.id, to)}
                    />
                  ))}
                </AnimatePresence>
                {list.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-fg-subtle">
                    <Inbox className="h-4 w-4" />
                    {style.empty}
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function BoardCard({
  task,
  today,
  showWorkspace,
  showProject,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  task: TaskView;
  today: string;
  showWorkspace: boolean;
  showProject: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: BoardColumn) => void;
}) {
  const isDone = task.status === "done";
  return (
    <motion.div
      layout
      layoutId={`card-${task.id}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: dragging ? 0.45 : 1, scale: dragging ? 0.98 : 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 38 }}
      className="relative"
    >
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/task-id", task.id);
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group cursor-grab rounded-2xl border border-line bg-solid p-3 shadow-card transition-shadow hover:shadow-pop active:cursor-grabbing",
          isDone && "bg-solid/70",
        )}
      >
        <div className="flex items-start gap-2">
          {isDone ? (
            <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          ) : null}
          <Link
            href={`/tasks/${task.id}`}
            draggable={false}
            className={cn("min-w-0 flex-1 text-sm font-semibold leading-snug text-fg hover:text-brand", isDone && "text-fg-subtle line-through decoration-emerald-500/50")}
          >
            {task.title}
          </Link>
          <MoveMenu current={task.status as BoardColumn} onMove={onMove} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <PriorityPill priority={task.priority} />
          <DueChip dueDate={task.dueDate} dueTime={task.dueTime} today={today} done={isDone} />
          <EffortChip estimate={task.estimateMinutes} actual={task.actualMinutes} />
          <SubtaskChip done={task.subtaskDone} total={task.subtaskTotal} />
          <RepeatIcon show={task.recurring} />
        </div>
        {(showProject && task.projectName) || (task.linkedType && task.linkedId) || showWorkspace ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {showWorkspace ? <WorkspaceBadge ws={task.workspace} /> : null}
            {showProject && task.projectName ? <span className="max-w-[10rem] truncate text-[11px] font-semibold text-fg-muted">{task.projectName}</span> : null}
            {task.linkedType && task.linkedId ? <LinkChip type={task.linkedType} id={task.linkedId} label={task.linkedLabel} /> : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/** Touch- and keyboard-friendly alternative to dragging. */
function MoveMenu({ current, onMove }: { current: BoardColumn; onMove: (to: BoardColumn) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative -mr-1 -mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-muted hover:text-fg"
        aria-label="Move to…"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-8 z-30 w-40 overflow-hidden rounded-xl border border-line bg-solid p-1 shadow-pop"
          >
            <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle">Move to</div>
            {BOARD_COLUMNS.filter((c) => c !== current).map((c) => (
              <button
                key={c}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onMove(c);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-fg transition hover:bg-muted"
              >
                <span className={cn("h-2 w-2 rounded-full", STATUS_META[c].dot)} />
                {STATUS_META[c].label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
