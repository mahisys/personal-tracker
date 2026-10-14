"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Building2,
  CalendarClock,
  Check,
  Clock,
  Loader2,
  Trophy,
  User,
  XCircle,
} from "lucide-react";
import type { StageKind } from "@/db/schema";
import { celebrate } from "@/components/client/celebrate";
import { buttonClass } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { formatDay, formatDateTime, relativeDay } from "@/lib/dates";
import { formatINRShort } from "@/lib/money";
import { cn } from "@/lib/cn";
import { moveLead } from "@/server/crm/actions";
import { FOLLOW_UP_CLASS } from "@/server/crm/pipeline";
import type { PipelineLead } from "@/server/crm/queries";

export type BoardStage = {
  id: string;
  name: string;
  kind: StageKind;
  probability: number;
};

export function useLeadMover() {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  async function move(
    leadId: string,
    stageId: string,
    lostReason?: string,
  ): Promise<boolean> {
    setPendingId(leadId);
    const f = new FormData();
    f.set("id", leadId);
    f.set("stageId", stageId);
    if (lostReason) f.set("lostReason", lostReason);
    try {
      const r = await moveLead(undefined, f);
      if (!r.ok) {
        toast.error(r.error ?? "Couldn't move that lead");
        return false;
      }
      if (r.celebrate) celebrate();
      if (r.invoiceId || r.projectId) {
        toast.success(r.message, {
          duration: 9000,
          description: (
            <span className="flex flex-wrap gap-3 pt-1 text-xs font-semibold">
              {r.invoiceId ? (
                <Link
                  href={`/invoices/${r.invoiceId}`}
                  className="underline underline-offset-2"
                >
                  Open draft invoice {r.invoiceNumber}
                </Link>
              ) : null}
              {r.projectId ? (
                <Link
                  href={`/projects/${r.projectId}`}
                  className="underline underline-offset-2"
                >
                  Open project
                </Link>
              ) : null}
            </span>
          ),
        });
      } else if (r.message) toast.success(r.message);
      startTransition(() => router.refresh());
      return true;
    } catch {
      toast.error("Something went wrong — please try again");
      return false;
    } finally {
      setPendingId(null);
    }
  }
  return { move, pendingId };
}

/** Asks for a lost reason before moving a lead to a lost stage. */
export function LostReasonDialog({
  open,
  onCancel,
  onConfirm,
  title,
}: {
  open: boolean;
  title?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <LostReasonBody
          title={title}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      ) : null}
    </AnimatePresence>
  );
}

const QUICK_LOST = [
  "Price too high",
  "Went with a competitor",
  "No budget right now",
  "No response",
  "Not a fit",
];

function LostReasonBody({
  onCancel,
  onConfirm,
  title,
}: {
  title?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const QUICK = QUICK_LOST;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        className="absolute inset-0 bg-[#0b0c1d]/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full rounded-t-3xl border border-line bg-solid p-6 shadow-pop sm:max-w-md sm:rounded-3xl"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        <h2 className="text-lg font-extrabold text-fg">Why was it lost?</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          {title ? `“${title}” — ` : ""}a quick note helps you win the next one.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setReason(q)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition",
                reason === q
                  ? "bg-brand text-white ring-brand"
                  : "bg-muted text-fg-muted ring-line hover:text-fg",
              )}
            >
              {q}
            </button>
          ))}
        </div>
        <Textarea
          className="mt-3"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Or write your own…"
          autoFocus
        />
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={buttonClass("secondary")}
            onClick={onCancel}
          >
            Keep it open
          </button>
          <button
            type="button"
            className={buttonClass("danger")}
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            Mark as lost
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function MoveMenu({
  stages,
  current,
  onPick,
  align = "right",
}: {
  stages: BoardStage[];
  current: string;
  onPick: (s: BoardStage) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-brand-soft hover:text-brand"
        aria-label="Move to stage"
        title="Move to…"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "absolute top-8 z-30 w-48 overflow-hidden rounded-xl border border-line bg-solid p-1 shadow-pop",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
              Move to
            </div>
            {stages.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={s.id === current}
                onClick={() => {
                  setOpen(false);
                  onPick(s);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition",
                  s.id === current
                    ? "text-fg-subtle"
                    : "text-fg hover:bg-brand-soft",
                  s.kind === "won" &&
                    s.id !== current &&
                    "text-emerald-700 dark:text-emerald-300",
                  s.kind === "lost" &&
                    s.id !== current &&
                    "text-rose-700 dark:text-rose-300",
                )}
              >
                <span className="truncate">{s.name}</span>
                {s.id === current ? (
                  <Check className="h-3.5 w-3.5" />
                ) : s.kind === "won" ? (
                  <Trophy className="h-3.5 w-3.5" />
                ) : s.kind === "lost" ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : null}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FollowUpChip({ lead }: { lead: PipelineLead }) {
  if (!lead.followUpDay || !lead.nextFollowUpAt)
    return <span className="text-[11px] text-fg-subtle">No follow-up set</span>;
  const label =
    lead.followUp === "today"
      ? `Today, ${formatDateTime(new Date(lead.nextFollowUpAt)).split(", ")[1]}`
      : relativeDay(lead.followUpDay);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-semibold",
        FOLLOW_UP_CLASS[lead.followUp],
      )}
    >
      <CalendarClock className="h-3 w-3" />
      {lead.followUp === "overdue" ? `Overdue · ${label}` : label}
    </span>
  );
}

function LeadCard({
  lead,
  stages,
  closed,
  pending,
  onMove,
  onDragStart,
}: {
  lead: PipelineLead;
  stages: BoardStage[];
  closed?: boolean;
  pending: boolean;
  onMove: (s: BoardStage) => void;
  onDragStart: (id: string) => void;
}) {
  return (
    <motion.div
      layout
      layoutId={lead.id}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "group relative rounded-2xl border border-line bg-solid p-3.5 shadow-card transition-shadow hover:shadow-pop",
        closed && "opacity-75",
        lead.followUp === "overdue" && !closed && "ring-1 ring-rose-500/25",
      )}
    >
      <div
        draggable={!pending}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", lead.id);
          e.dataTransfer.effectAllowed = "move";
          onDragStart(lead.id);
        }}
        className="cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/crm/leads/${lead.id}`}
            className="min-w-0 text-sm font-bold leading-snug text-fg hover:text-brand"
            draggable={false}
          >
            {lead.title}
          </Link>
          <div className="-mr-1 -mt-1 shrink-0">
            {pending ? (
              <Loader2 className="m-1.5 h-4 w-4 animate-spin text-brand" />
            ) : (
              <MoveMenu
                stages={stages}
                current={lead.stageId}
                onPick={onMove}
              />
            )}
          </div>
        </div>
        {lead.companyName || lead.contactName ? (
          <div className="mt-1 flex min-w-0 items-center gap-1 truncate text-xs text-fg-muted">
            {lead.companyName ? (
              <Building2 className="h-3 w-3 shrink-0" />
            ) : (
              <User className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">
              {[lead.companyName, lead.contactName].filter(Boolean).join(" · ")}
            </span>
          </div>
        ) : null}
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            {!closed ? <FollowUpChip lead={lead} /> : null}
            {lead.daysSinceActivity != null ? (
              <div
                className={cn(
                  "flex items-center gap-1 text-[11px]",
                  lead.daysSinceActivity > 14 && !closed
                    ? "text-amber-600 dark:text-amber-300"
                    : "text-fg-subtle",
                )}
              >
                <Clock className="h-3 w-3" />
                {lead.daysSinceActivity === 0
                  ? "Active today"
                  : `${lead.daysSinceActivity}d since last touch`}
              </div>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-extrabold tabular-nums text-fg">
              {lead.valuePaise ? formatINRShort(lead.valuePaise) : "—"}
            </div>
            {!closed ? (
              <div className="text-[10px] font-semibold text-fg-subtle">
                {lead.probability}%
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function PipelineBoard({
  stages,
  leads,
  closedRecent,
  view,
}: {
  stages: BoardStage[];
  leads: PipelineLead[];
  closedRecent: PipelineLead[];
  view: "board" | "list";
}) {
  const [items, setItems] = useState<PipelineLead[]>([
    ...leads,
    ...closedRecent,
  ]);
  // Re-sync with fresh server data after router.refresh().
  const [source, setSource] = useState({ leads, closedRecent });
  if (source.leads !== leads || source.closedRecent !== closedRecent) {
    setSource({ leads, closedRecent });
    setItems([...leads, ...closedRecent]);
  }
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<{
    lead: PipelineLead;
    stage: BoardStage;
  } | null>(null);
  const { move, pendingId } = useLeadMover();
  const kindOf = useMemo(
    () => new Map(stages.map((s) => [s.id, s.kind])),
    [stages],
  );

  async function requestMove(
    lead: PipelineLead,
    stage: BoardStage,
    reason?: string,
  ) {
    if (lead.stageId === stage.id) return;
    if (stage.kind === "lost" && !reason) {
      setLostFor({ lead, stage });
      return;
    }
    const prev = items;
    setItems((xs) =>
      xs.map((x) =>
        x.id === lead.id
          ? { ...x, stageId: stage.id, probability: stage.probability }
          : x,
      ),
    );
    const ok = await move(lead.id, stage.id, reason);
    if (!ok) setItems(prev);
  }

  if (view === "list") {
    const open = items
      .filter((l) => kindOf.get(l.stageId) === "open")
      .sort((a, b) =>
        (a.nextFollowUpAt ?? "9999").localeCompare(b.nextFollowUpAt ?? "9999"),
      );
    return (
      <>
        <div className="glass overflow-hidden rounded-[var(--radius-card)] border border-line shadow-card">
          <ul className="stagger divide-y divide-line">
            {open.map((l) => {
              const stage = stages.find((s) => s.id === l.stageId);
              return (
                <li
                  key={l.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-soft/50"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/crm/leads/${l.id}`}
                      className="block truncate text-sm font-bold text-fg hover:text-brand"
                    >
                      {l.title}
                    </Link>
                    <div className="truncate text-xs text-fg-muted">
                      {[stage?.name, l.companyName, l.contactName]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="hidden w-40 shrink-0 sm:block">
                    <FollowUpChip lead={l} />
                    {l.followUpDay ? (
                      <div className="text-[11px] text-fg-subtle">
                        {formatDay(l.followUpDay, { short: true })}
                      </div>
                    ) : null}
                  </div>
                  <div className="w-20 shrink-0 text-right">
                    <div className="text-sm font-extrabold tabular-nums text-fg">
                      {l.valuePaise ? formatINRShort(l.valuePaise) : "—"}
                    </div>
                    <div className="sm:hidden">
                      <FollowUpChip lead={l} />
                    </div>
                  </div>
                  {pendingId === l.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand" />
                  ) : (
                    <MoveMenu
                      stages={stages}
                      current={l.stageId}
                      onPick={(s) => requestMove(l, s)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <LostReasonDialog
          open={!!lostFor}
          title={lostFor?.lead.title}
          onCancel={() => setLostFor(null)}
          onConfirm={(reason) => {
            const lf = lostFor!;
            setLostFor(null);
            requestMove(lf.lead, lf.stage, reason);
          }}
        />
      </>
    );
  }

  return (
    <>
      <LayoutGroup>
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {stages.map((stage) => {
            const col = items.filter((l) => l.stageId === stage.id);
            const total = col.reduce((s, l) => s + l.valuePaise, 0);
            const closed = stage.kind !== "open";
            const isOver = overStage === stage.id && dragId != null;
            return (
              <section
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overStage !== stage.id) setOverStage(stage.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node))
                    setOverStage((s) => (s === stage.id ? null : s));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  setOverStage(null);
                  setDragId(null);
                  const lead = items.find((x) => x.id === id);
                  if (lead) requestMove(lead, stage);
                }}
                className={cn(
                  "flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-[var(--radius-card)] border p-3 transition-colors sm:w-72",
                  closed
                    ? "border-dashed border-line-strong bg-muted/40"
                    : "border-line bg-elev/60",
                  stage.kind === "won" && "bg-emerald-500/[0.04]",
                  isOver && "border-brand bg-brand-soft ring-2 ring-brand/30",
                  isOver &&
                    stage.kind === "won" &&
                    "border-emerald-500 bg-emerald-500/10 ring-emerald-500/30",
                  isOver &&
                    stage.kind === "lost" &&
                    "border-rose-500 bg-rose-500/10 ring-rose-500/30",
                )}
              >
                <header className="mb-3 px-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={cn(
                        "flex items-center gap-1.5 truncate text-sm font-extrabold",
                        stage.kind === "won"
                          ? "text-emerald-700 dark:text-emerald-300"
                          : stage.kind === "lost"
                            ? "text-rose-700 dark:text-rose-300"
                            : "text-fg",
                      )}
                    >
                      {stage.kind === "won" ? (
                        <Trophy className="h-3.5 w-3.5" />
                      ) : stage.kind === "lost" ? (
                        <XCircle className="h-3.5 w-3.5" />
                      ) : null}
                      {stage.name}
                    </h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-fg-muted">
                      {col.length}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-fg-subtle">
                    <span className="font-semibold tabular-nums text-fg-muted">
                      {formatINRShort(total)}
                    </span>
                    <span>
                      {closed ? "last 30 days" : `${stage.probability}% likely`}
                    </span>
                  </div>
                </header>
                <div className="flex min-h-24 flex-1 flex-col gap-2.5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {col.map((l) => (
                      <LeadCard
                        key={l.id}
                        lead={l}
                        stages={stages}
                        closed={closed}
                        pending={pendingId === l.id}
                        onMove={(s) => requestMove(l, s)}
                        onDragStart={setDragId}
                      />
                    ))}
                  </AnimatePresence>
                  {col.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-fg-subtle">
                      {stage.kind === "won"
                        ? "Drop a lead here to celebrate 🎉"
                        : stage.kind === "lost"
                          ? "Nothing lost lately"
                          : "Drag leads here"}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </LayoutGroup>
      <LostReasonDialog
        open={!!lostFor}
        title={lostFor?.lead.title}
        onCancel={() => setLostFor(null)}
        onConfirm={(reason) => {
          const lf = lostFor!;
          setLostFor(null);
          requestMove(lf.lead, lf.stage, reason);
        }}
      />
    </>
  );
}
