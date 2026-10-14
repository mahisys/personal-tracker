"use client";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Ban, Check, ChevronRight, RotateCcw, XCircle } from "lucide-react";
import type { LoanStage } from "@/db/schema";
import { celebrate } from "@/components/client/celebrate";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { moveStageAction } from "@/server/dsa/actions";
import { PIPELINE_STAGES, STAGE_LABELS, STAGE_SHORT, isClosedStage, stageIndex, stageNeedsInput } from "@/server/dsa/constants";
import { Dialog } from "./dialog";
import { StageMoveForm, stageMoveCopy, type MoveTarget, type Option } from "./stage-move-form";

/**
 * Animated stage stepper with the move controls. Tap any step to move there; stages that need
 * details (login, sanction, disbursal, payout) open a short form first.
 */
export function StageControl({
  file,
  stage,
  lenders,
  accounts,
  today,
  closeReason,
  reachedIndex,
}: {
  file: MoveTarget;
  stage: LoanStage;
  lenders: Option[];
  accounts: Option[];
  today: string;
  closeReason: string | null;
  /** Furthest pipeline stage reached (for closed files) */
  reachedIndex: number;
}) {
  const [target, setTarget] = useState<LoanStage | null>(null);
  const [pending, startTransition] = useTransition();
  const closed = isClosedStage(stage);
  const current = closed ? reachedIndex : stageIndex(stage);
  const next = !closed && current < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[current + 1] : null;
  const pct = (Math.max(0, current) / (PIPELINE_STAGES.length - 1)) * 100;

  function go(to: LoanStage) {
    if (to === stage) return;
    if (stageNeedsInput(to)) {
      setTarget(to);
      return;
    }
    startTransition(async () => {
      const f = new FormData();
      f.set("fileId", file.id);
      f.set("stage", to);
      const res = await moveStageAction(undefined, f);
      if (res?.error) toast.error(res.error);
      else if (res?.ok) {
        toast.success(res.message);
        if (res.celebrate) celebrate();
      }
    });
  }

  return (
    <div className={cn("transition-opacity", pending && "opacity-70")}>
      {closed ? (
        <div className={cn("mb-4 flex items-start gap-3 rounded-2xl px-4 py-3 ring-1 ring-inset", stage === "rejected" ? "bg-rose-500/10 ring-rose-500/25" : "bg-muted ring-line-strong")}>
          {stage === "rejected" ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" /> : <Ban className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" />}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-fg">{STAGE_LABELS[stage]}</div>
            {closeReason ? <div className="text-sm text-fg-muted">{closeReason}</div> : null}
          </div>
          <button type="button" onClick={() => go(PIPELINE_STAGES[Math.max(0, reachedIndex)])} className={buttonClass("secondary", "sm")}>
            <RotateCcw className="h-3.5 w-3.5" /> Reopen
          </button>
        </div>
      ) : null}

      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <ol className="relative flex min-w-[640px] items-start justify-between">
          <div className="absolute left-[18px] right-[18px] top-[17px] h-1 rounded-full bg-muted" />
          <motion.div
            className={cn("absolute left-[18px] top-[17px] h-1 rounded-full", closed ? "bg-fg-subtle/50" : "bg-[linear-gradient(90deg,#f59e0b,#f97316,#10b981)]")}
            initial={{ width: 0 }}
            animate={{ width: `calc((100% - 36px) * ${pct / 100})` }}
            transition={{ type: "spring", stiffness: 90, damping: 20, delay: 0.15 }}
          />
          {PIPELINE_STAGES.map((s, i) => {
            const doneStep = i < current || (!closed && s === "payout_received" && stage === "payout_received");
            const isCurrent = !closed && i === current;
            return (
              <li key={s} className="relative z-10 flex w-[68px] flex-col items-center text-center">
                <motion.button
                  type="button"
                  onClick={() => go(s)}
                  disabled={isCurrent || pending}
                  title={isCurrent ? `Currently ${STAGE_LABELS[s]}` : `Move to ${STAGE_LABELS[s]}`}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: isCurrent ? 1.12 : 1, opacity: 1 }}
                  whileHover={isCurrent ? undefined : { scale: 1.12 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22, delay: i * 0.04 }}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-xs font-extrabold ring-4 ring-bg transition-colors",
                    doneStep && !closed && "bg-emerald-500 text-white",
                    doneStep && closed && "bg-fg-subtle text-white",
                    isCurrent && "bg-[linear-gradient(135deg,#f59e0b,#f97316)] text-white shadow-[0_8px_20px_-6px_#f59e0b]",
                    !doneStep && !isCurrent && "border border-line-strong bg-solid text-fg-muted hover:border-amber-400 hover:text-amber-600",
                  )}
                >
                  {doneStep ? <Check className="h-4 w-4" /> : i + 1}
                </motion.button>
                {isCurrent ? (
                  <motion.span layoutId="dsa-stage-pulse" className="pointer-events-none absolute top-0 h-9 w-9 animate-ping rounded-full bg-amber-400/30" />
                ) : null}
                <span className={cn("mt-2 text-[11px] font-semibold leading-tight", isCurrent ? "text-fg" : "text-fg-subtle")}>
                  <span className="sm:hidden">{STAGE_SHORT[s]}</span>
                  <span className="hidden sm:inline">{STAGE_LABELS[s]}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {!closed ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {next ? (
            <button type="button" onClick={() => go(next)} disabled={pending} className={buttonClass(next === "disbursed" || next === "sanctioned" || next === "payout_received" ? "success" : "primary", "md")}>
              {next === "payout_received" ? "Record payout" : `Move to ${STAGE_LABELS[next]}`}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
          {stageIndex(stage) < stageIndex("disbursed") ? (
            <>
              <button type="button" onClick={() => go("rejected")} disabled={pending} className={buttonClass("danger", "md")}>
                <XCircle className="h-4 w-4" /> Rejected
              </button>
              <button type="button" onClick={() => go("dropped")} disabled={pending} className={buttonClass("ghost", "md")}>
                <Ban className="h-4 w-4" /> Drop
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <Dialog open={target != null} onClose={() => setTarget(null)} title={target ? stageMoveCopy(target).title : ""} description={target ? stageMoveCopy(target).description : undefined}>
        {target ? <StageMoveForm file={file} stage={target} lenders={lenders} accounts={accounts} today={today} /> : null}
      </Dialog>
    </div>
  );
}
