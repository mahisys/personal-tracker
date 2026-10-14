"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, Loader2, Trophy, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { LostReasonDialog, useLeadMover, type BoardStage } from "./pipeline-board";

/** Animated stage stepper for a lead. Click a step to move the lead there. */
export function StageStepper({ leadId, leadTitle, stages, currentId }: { leadId: string; leadTitle: string; stages: BoardStage[]; currentId: string }) {
  const [current, setCurrent] = useState(currentId);
  const [askLost, setAskLost] = useState<BoardStage | null>(null);
  const { move, pendingId } = useLeadMover();
  const open = stages.filter((s) => s.kind === "open");
  const won = stages.filter((s) => s.kind === "won");
  const lost = stages.filter((s) => s.kind === "lost");
  const cur = stages.find((s) => s.id === current);
  const curIndex = open.findIndex((s) => s.id === current);
  const closedWon = cur?.kind === "won";
  const pending = pendingId === leadId;

  async function go(s: BoardStage, reason?: string) {
    if (s.id === current || pending) return;
    if (s.kind === "lost" && !reason) {
      setAskLost(s);
      return;
    }
    const prev = current;
    setCurrent(s.id);
    if (!(await move(leadId, s.id, reason))) setCurrent(prev);
  }

  return (
    <div className="glass rounded-[var(--radius-card)] border border-line p-4 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <ol className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1 pb-1">
          {open.map((s, i) => {
            const done = closedWon || (curIndex >= 0 && i < curIndex);
            const active = s.id === current;
            return (
              <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1">
                <button
                  type="button"
                  onClick={() => go(s)}
                  disabled={pending}
                  className={cn(
                    "relative flex w-full min-w-[96px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition",
                    active ? "text-white" : done ? "bg-brand-soft text-brand hover:bg-brand/15" : "bg-muted text-fg-muted hover:text-fg",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId={`stage-pill-${leadId}`}
                      className="absolute inset-0 rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] shadow-[0_8px_20px_-8px_var(--brand)]"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  <span className="relative flex items-center gap-1.5 truncate">
                    {done && !active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                    {active && pending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : null}
                    <span className="truncate">{s.name}</span>
                  </span>
                </button>
                {i < open.length - 1 ? <span className={cn("h-0.5 w-2 shrink-0 rounded-full", done ? "bg-brand/50" : "bg-line-strong")} /> : null}
              </li>
            );
          })}
        </ol>
        <div className="flex gap-2">
          {won.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={pending}
              onClick={() => go(s)}
              className={cn(
                "relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition lg:flex-none",
                s.id === current ? "text-white" : "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
              )}
            >
              {s.id === current ? (
                <motion.span layoutId={`stage-pill-${leadId}`} className="absolute inset-0 rounded-xl bg-[linear-gradient(135deg,#10b981,#22c1a3)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              ) : null}
              <span className="relative inline-flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" /> {s.id === current ? s.name : `Mark ${s.name.toLowerCase()}`}
              </span>
            </button>
          ))}
          {lost.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={pending}
              onClick={() => go(s)}
              className={cn(
                "relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition lg:flex-none",
                s.id === current ? "text-white" : "bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300",
              )}
            >
              {s.id === current ? <motion.span layoutId={`stage-pill-${leadId}`} className="absolute inset-0 rounded-xl bg-rose-500" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
              <span className="relative inline-flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5" /> {s.id === current ? s.name : `Mark ${s.name.toLowerCase()}`}
              </span>
            </button>
          ))}
        </div>
      </div>
      <LostReasonDialog
        open={!!askLost}
        title={leadTitle}
        onCancel={() => setAskLost(null)}
        onConfirm={(r) => {
          const s = askLost!;
          setAskLost(null);
          go(s, r);
        }}
      />
    </div>
  );
}
