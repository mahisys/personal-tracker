"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, FileText, Landmark, Phone, Receipt, RefreshCcw, Target } from "lucide-react";
import type { NeedsItem, NeedsKind } from "@/server/today/types";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { PriorityPill, RepeatIcon } from "@/components/tasks/task-bits";
import { SnoozeButton } from "@/components/tasks/snooze-button";
import { TaskCheck } from "@/components/tasks/task-check";
import { cn } from "@/lib/cn";

const KIND: Record<Exclude<NeedsKind, "task">, { icon: typeof Target; className: string; label: string }> = {
  lead: { icon: Target, className: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300", label: "Lead" },
  bill: { icon: Receipt, className: "bg-rose-500/12 text-rose-600 dark:text-rose-300", label: "Bill" },
  invoice: { icon: FileText, className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300", label: "Invoice" },
  loan_file: { icon: Landmark, className: "bg-amber-500/14 text-amber-600 dark:text-amber-300", label: "Loan file" },
  renewal: { icon: RefreshCcw, className: "bg-sky-500/12 text-sky-600 dark:text-sky-300", label: "Renewal" },
};

const FILTERS: { key: string; label: string; kinds: NeedsKind[] }[] = [
  { key: "all", label: "All", kinds: [] },
  { key: "tasks", label: "Tasks", kinds: ["task"] },
  { key: "people", label: "Follow-ups", kinds: ["lead", "loan_file"] },
  { key: "money", label: "Money", kinds: ["bill", "invoice"] },
  { key: "renewals", label: "Renewals", kinds: ["renewal"] },
];

/** The prioritised "Needs you" list: tasks can be ticked or snoozed in place; everything else is one tap away. */
export function NeedsYou({ items }: { items: NeedsItem[] }) {
  const [filter, setFilter] = useState("all");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of FILTERS) m[f.key] = f.kinds.length ? items.filter((i) => f.kinds.includes(i.kind)).length : items.length;
    return m;
  }, [items]);
  const kinds = FILTERS.find((f) => f.key === filter)?.kinds ?? [];
  const visible = kinds.length ? items.filter((i) => kinds.includes(i.kind)) : items;

  return (
    <div>
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0).map((f) => {
          const on = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={on}
              className={cn(
                "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors",
                on ? "text-bg" : "bg-muted/70 text-fg-muted hover:text-fg",
              )}
            >
              {on ? <motion.span layoutId="needs-filter" className="absolute inset-0 rounded-full bg-fg" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
              <span className="relative">{f.label}</span>
              <span className={cn("relative tabular-nums", on ? "opacity-70" : "opacity-60")}>{counts[f.key]}</span>
            </button>
          );
        })}
      </div>

      <div className="glass overflow-hidden rounded-[var(--radius-card)] border border-line shadow-card">
        <AnimatePresence initial={false}>
          {visible.map((item, i) => (
            <motion.div
              key={item.key}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.035 } }}
              exit={{ opacity: 0, height: 0, transition: { duration: 0.3 } }}
              className="border-b border-line last:border-0"
            >
              <Row item={item} ticked={!!ticked[item.key]} onTick={(d) => setTicked((t) => ({ ...t, [item.key]: d }))} />
            </motion.div>
          ))}
        </AnimatePresence>
        {visible.length === 0 ? <div className="px-5 py-8 text-center text-sm text-fg-subtle">Nothing in this group. Lovely.</div> : null}
      </div>
    </div>
  );
}

function Row({ item, ticked, onTick }: { item: NeedsItem; ticked: boolean; onTick: (done: boolean) => void }) {
  const isTask = item.kind === "task";
  const meta = !isTask ? KIND[item.kind as Exclude<NeedsKind, "task">] : null;
  const Icon = meta?.icon;
  return (
    <div className={cn("group relative flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-brand-soft/50", ticked && "opacity-70")}>
      {item.overdue && !ticked ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-rose-500/80" aria-hidden /> : null}
      <div className="relative z-10 flex w-9 shrink-0 justify-center">
        {isTask ? (
          <TaskCheck id={item.id} done={false} priority={item.priority} label={`Complete ${item.title}`} onChange={onTick} />
        ) : Icon ? (
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", meta!.className)}>
            <Icon className="h-4.5 w-4.5" />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={item.href}
            className={cn(
              "min-w-0 truncate text-[15px] font-semibold text-fg transition-colors after:absolute after:inset-0 hover:text-brand",
              ticked && "text-fg-subtle line-through decoration-emerald-500/60 decoration-2",
            )}
          >
            {item.title}
          </Link>
          {isTask ? <PriorityPill priority={item.priority ?? 3} className="shrink-0" /> : null}
          {item.recurring ? <RepeatIcon show /> : null}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <WorkspaceBadge ws={item.workspace} className="shrink-0" />
          <span className={cn("truncate text-xs font-medium", item.overdue ? "text-rose-600 dark:text-rose-300" : "text-fg-muted")}>{item.context}</span>
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        {isTask && !ticked ? <SnoozeButton id={item.id} compact /> : null}
        {item.phone ? (
          <a
            href={`tel:${item.phone.replace(/[^\d+]/g, "")}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 transition hover:bg-emerald-500 hover:text-white dark:text-emerald-300"
            aria-label={`Call about ${item.title}`}
            title="Call"
          >
            <Phone className="h-4 w-4" />
          </a>
        ) : null}
        {!isTask ? <ChevronRight className="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5" /> : null}
      </div>
    </div>
  );
}
