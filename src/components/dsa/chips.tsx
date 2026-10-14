import { Clock, Hourglass } from "lucide-react";
import type { LoanProduct, LoanStage, PendingWith } from "@/db/schema";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { PENDING_LABELS, PRODUCT_LABELS, PRODUCT_SHORT, STAGE_LABELS } from "@/server/dsa/constants";
import type { Staleness } from "@/server/dsa/logic";

export function stageTone(stage: LoanStage): Tone {
  switch (stage) {
    case "sanctioned":
      return "violet";
    case "disbursed":
    case "payout_invoiced":
      return "info";
    case "payout_received":
      return "good";
    case "rejected":
      return "bad";
    case "dropped":
      return "neutral";
    case "logged_in":
    case "credit_query":
      return "brand";
    default:
      return "warn";
  }
}

export function StageBadge({ stage, className }: { stage: LoanStage; className?: string }) {
  return (
    <Badge tone={stageTone(stage)} dot className={className}>
      {STAGE_LABELS[stage]}
    </Badge>
  );
}

const pendingTone: Record<PendingWith, string> = {
  me: "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300",
  customer: "bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-300",
  lender: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  valuation_legal: "bg-fuchsia-500/10 text-fuchsia-700 ring-fuchsia-500/25 dark:text-fuchsia-300",
  none: "bg-muted text-fg-muted ring-line-strong",
};

export function PendingChip({ pendingWith, className }: { pendingWith: PendingWith; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", pendingTone[pendingWith], className)}>
      <Hourglass className="h-3 w-3" />
      {pendingWith === "none" ? "Nothing pending" : PENDING_LABELS[pendingWith]}
    </span>
  );
}

export const stalenessClass: Record<Staleness, string> = {
  fresh: "bg-muted text-fg-muted ring-line-strong",
  over: "bg-amber-500/14 text-amber-800 ring-amber-500/30 dark:text-amber-300",
  way_over: "bg-rose-500/12 text-rose-700 ring-rose-500/30 dark:text-rose-300",
};

export function DaysChip({ days, level, limit, className }: { days: number; level: Staleness; limit?: number | null; className?: string }) {
  return (
    <span
      title={limit != null ? `${days} day${days === 1 ? "" : "s"} in this stage (limit ${limit})` : `${days} days in this stage`}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ring-inset", stalenessClass[level], className)}
    >
      <Clock className="h-3 w-3" />
      {days === 0 ? "today" : `${days}d`}
    </span>
  );
}

export function ProductTag({ product, short, className }: { product: LoanProduct; short?: boolean; className?: string }) {
  return (
    <span title={PRODUCT_LABELS[product]} className={cn("inline-flex items-center whitespace-nowrap rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300", className)}>
      {short ? PRODUCT_SHORT[product] : PRODUCT_LABELS[product]}
    </span>
  );
}
