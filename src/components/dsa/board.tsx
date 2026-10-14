"use client";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowRightLeft, Check, FileText, GripVertical, Inbox, Landmark } from "lucide-react";
import type { LoanProduct, LoanStage, PendingWith } from "@/db/schema";
import { celebrate } from "@/components/client/celebrate";
import { cn } from "@/lib/cn";
import { formatINRShort } from "@/lib/money";
import { moveStageAction } from "@/server/dsa/actions";
import { BOARD_STAGES, CLOSED_STAGES, PIPELINE_STAGES, STAGE_LABELS, stageNeedsInput } from "@/server/dsa/constants";
import type { Staleness } from "@/server/dsa/logic";
import { DaysChip, PendingChip, ProductTag } from "./chips";
import { Dialog } from "./dialog";
import { StageMoveForm, stageMoveCopy, type MoveTarget, type Option } from "./stage-move-form";

export type BoardCard = MoveTarget & {
  product: LoanProduct;
  lenderName: string | null;
  amountPaise: number;
  stage: LoanStage;
  days: number;
  limit: number | null;
  level: Staleness;
  pendingWith: PendingWith;
  pendingNote: string;
  docsDone: number;
  docsTotal: number;
};

const columnAccent: Partial<Record<LoanStage, string>> = {
  lead: "from-amber-400",
  eligibility: "from-amber-500",
  documents: "from-orange-500",
  logged_in: "from-violet-500",
  credit_query: "from-indigo-500",
  sanctioned: "from-fuchsia-500",
  disbursed: "from-sky-500",
  payout_invoiced: "from-emerald-500",
};

export function Board({ cards, lenders, accounts, today }: { cards: BoardCard[]; lenders: Option[]; accounts: Option[]; today: string }) {
  const [optimistic, applyMove] = useOptimistic(cards, (state, m: { id: string; stage: LoanStage }) =>
    state.map((c) => (c.id === m.id ? { ...c, stage: m.stage, days: 0, level: "fresh" as Staleness } : c)),
  );
  const [, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LoanStage | null>(null);
  const [dialog, setDialog] = useState<{ card: BoardCard; stage: LoanStage } | null>(null);

  function moveTo(card: BoardCard, stage: LoanStage) {
    if (card.stage === stage) return;
    if (stageNeedsInput(stage)) {
      setDialog({ card, stage });
      return;
    }
    startTransition(async () => {
      applyMove({ id: card.id, stage });
      const form = new FormData();
      form.set("fileId", card.id);
      form.set("stage", stage);
      const res = await moveStageAction(undefined, form);
      if (res?.error) toast.error(res.error);
      else if (res?.ok) {
        toast.success(res.message ?? `Moved to ${STAGE_LABELS[stage]}`);
        if (res.celebrate) celebrate();
      }
    });
  }

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex snap-x snap-mandatory gap-3">
          {BOARD_STAGES.map((stage) => {
            const list = optimistic.filter((c) => c.stage === stage);
            const total = list.reduce((s, c) => s + c.amountPaise, 0);
            const isOver = over === stage && dragId != null;
            return (
              <section
                key={stage}
                aria-label={STAGE_LABELS[stage]}
                className={cn(
                  "glass flex w-[78vw] max-w-[290px] shrink-0 snap-start flex-col rounded-[var(--radius-card)] border border-line p-2.5 shadow-card transition-all duration-200 sm:w-[272px]",
                  isOver && "border-amber-400/70 ring-4 ring-amber-400/20",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== stage) setOver(stage);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === stage ? null : o));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/dsa-file") || dragId;
                  setOver(null);
                  setDragId(null);
                  const card = optimistic.find((c) => c.id === id);
                  if (card) moveTo(card, stage);
                }}
              >
                <header className="relative mb-2 overflow-hidden rounded-xl px-2.5 pb-2 pt-2">
                  <div className={cn("absolute inset-x-0 top-0 h-1 rounded-full bg-gradient-to-r to-transparent", columnAccent[stage])} />
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-[13px] font-extrabold text-fg">{STAGE_LABELS[stage]}</h3>
                    <span className="rounded-full bg-muted px-2 text-[11px] font-bold tabular-nums text-fg-muted">{list.length}</span>
                  </div>
                  <div className="text-[11px] font-semibold tabular-nums text-fg-subtle">{list.length ? formatINRShort(total) : "—"}</div>
                </header>
                <div className="flex min-h-24 flex-1 flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {list.map((c) => (
                      <BoardCardView
                        key={c.id}
                        card={c}
                        dragging={dragId === c.id}
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOver(null);
                        }}
                        onMove={(s) => moveTo(c, s)}
                      />
                    ))}
                  </AnimatePresence>
                  {list.length === 0 ? (
                    <div className={cn("flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong py-6 text-center text-xs text-fg-subtle transition", isOver && "border-amber-400 bg-amber-400/5 text-amber-700 dark:text-amber-300")}>
                      <Inbox className="h-4 w-4" />
                      {isOver ? "Drop to move here" : "Nothing here"}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <Dialog
        open={dialog != null}
        onClose={() => setDialog(null)}
        title={dialog ? stageMoveCopy(dialog.stage).title : ""}
        description={dialog ? `${dialog.card.borrowerName} · ${stageMoveCopy(dialog.stage).description}` : undefined}
      >
        {dialog ? <StageMoveForm file={dialog.card} stage={dialog.stage} lenders={lenders} accounts={accounts} today={today} /> : null}
      </Dialog>
    </>
  );
}

function BoardCardView({
  card,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: BoardCard;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (s: LoanStage) => void;
}) {
  const [menu, setMenu] = useState(false);
  const docsPct = card.docsTotal ? Math.round((card.docsDone / card.docsTotal) * 100) : 0;
  return (
    <motion.div
      layout
      layoutId={`dsa-card-${card.id}`}
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: dragging ? 0.45 : 1, scale: dragging ? 0.98 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="relative"
    >
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/dsa-file", card.id);
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group cursor-grab rounded-2xl border border-line bg-solid p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card active:cursor-grabbing",
          card.level === "way_over" && "border-l-4 border-l-rose-500",
          card.level === "over" && "border-l-4 border-l-amber-500",
        )}
      >
        <div className="flex items-start gap-2">
          <GripVertical className="mt-0.5 hidden h-4 w-4 shrink-0 text-fg-subtle opacity-0 transition group-hover:opacity-100 sm:block" />
          <div className="min-w-0 flex-1">
            <Link href={`/dsa/files/${card.id}`} draggable={false} className="block truncate text-sm font-bold text-fg hover:text-amber-600 dark:hover:text-amber-300">
              {card.borrowerName}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <ProductTag product={card.product} short />
              <span className="text-sm font-extrabold tabular-nums text-fg">{formatINRShort(card.amountPaise)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-fg-subtle transition hover:bg-muted hover:text-fg"
            aria-label="Move to another stage"
            title="Move to…"
          >
            <ArrowRightLeft className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
          <Landmark className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{card.lenderName ?? "Lender not picked"}</span>
        </div>
        {card.pendingNote ? <p className="mt-1.5 line-clamp-2 text-xs text-fg-muted">“{card.pendingNote}”</p> : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <DaysChip days={card.days} level={card.level} limit={card.limit} />
          <PendingChip pendingWith={card.pendingWith} />
          {card.docsTotal > 0 && ["lead", "eligibility", "documents", "logged_in", "credit_query"].includes(card.stage) ? (
            <span title={`${card.docsDone} of ${card.docsTotal} documents in`} className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-fg-subtle">
              <FileText className="h-3 w-3" />
              {docsPct}%
            </span>
          ) : null}
        </div>
      </div>
      <AnimatePresence>{menu ? <MoveMenu current={card.stage} onPick={(s) => { setMenu(false); onMove(s); }} onClose={() => setMenu(false)} /> : null}</AnimatePresence>
    </motion.div>
  );
}

function MoveMenu({ current, onPick, onClose }: { current: LoanStage; onPick: (s: LoanStage) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const stages: LoanStage[] = [...PIPELINE_STAGES, ...CLOSED_STAGES];
  return (
    <motion.div
      ref={ref}
      role="menu"
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="absolute right-0 top-10 z-30 w-56 overflow-hidden rounded-2xl border border-line bg-solid p-1.5 shadow-pop"
    >
      <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">Move to</div>
      {stages.map((s) => {
        const on = s === current;
        const closed = s === "rejected" || s === "dropped";
        return (
          <button
            key={s}
            type="button"
            role="menuitem"
            disabled={on}
            onClick={() => onPick(s)}
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition",
              on ? "text-fg-subtle" : closed ? "text-rose-600 hover:bg-rose-500/10 dark:text-rose-300" : "text-fg hover:bg-amber-500/10",
              s === "rejected" && "mt-1 border-t border-line pt-2.5",
            )}
          >
            {STAGE_LABELS[s]}
            {on ? <Check className="h-4 w-4" /> : null}
          </button>
        );
      })}
    </motion.div>
  );
}
