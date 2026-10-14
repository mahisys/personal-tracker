import Link from "next/link";
import { CalendarClock, Repeat, Wallet } from "lucide-react";
import type { BillKind, BillPriority, WorkspaceKey } from "@/db/schema";
import { describeRecurrence } from "@/lib/recurrence";
import { formatDay, relativeDay } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { SubNav } from "@/components/ui/page";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { BILL_KIND_LABEL, PRIORITY_META } from "@/server/planner/bills";
import type { AccountOption, CategoryOption } from "@/components/books/transaction-dialog";
import { MoveBillDialog, PayBillDialog, SkipBillButton, type ActionBill } from "./bill-actions";

export function PlannerNav({ active }: { active: string }) {
  return (
    <SubNav
      active={active}
      items={[
        { href: "/planner", label: "Upcoming & forecast" },
        { href: "/planner/renewals", label: "Renewals" },
      ]}
    />
  );
}

export function PriorityBadge({ priority }: { priority: BillPriority }) {
  const m = PRIORITY_META[priority];
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export type CardBill = ActionBill & {
  workspace: WorkspaceKey;
  kind: BillKind;
  priority: BillPriority;
  payee: string | null;
  accountName: string | null;
  recurrence: import("@/db/schema").Recurrence | null;
};

export function BillCard({ bill, today, accounts, categories }: { bill: CardBill; today: string; accounts: AccountOption[]; categories: CategoryOption[] }) {
  const overdue = bill.dueDate < today;
  const dueToday = bill.dueDate === today;
  return (
    <div className={cn("glass group relative overflow-hidden rounded-[var(--radius-card)] border p-4 shadow-card transition-all duration-300 hover:shadow-pop", overdue ? "border-rose-500/30" : "border-line")}>
      {overdue ? <div className="absolute inset-y-0 left-0 w-1 bg-rose-500" /> : dueToday ? <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" /> : null}
      <div className="flex items-start gap-3">
        <div className={cn("flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none", overdue ? "bg-rose-500/12 text-rose-600 dark:text-rose-300" : dueToday ? "bg-amber-500/14 text-amber-700 dark:text-amber-300" : "bg-brand-soft text-brand")}>
          <span className="text-base font-extrabold">{Number(bill.dueDate.slice(8, 10))}</span>
          <span className="text-[9px] font-bold uppercase">{formatDay(bill.dueDate).split(" ")[1]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <Link href={`/planner/bills/${bill.id}`} className="min-w-0">
              <div className="truncate font-bold text-fg hover:text-brand">{bill.title}</div>
              <div className={cn("text-xs font-semibold", overdue ? "text-rose-600 dark:text-rose-400" : dueToday ? "text-amber-700 dark:text-amber-300" : "text-fg-muted")}>
                {overdue ? `Overdue · was due ${relativeDay(bill.dueDate, today)}` : `Due ${relativeDay(bill.dueDate, today).toLowerCase()}`}
                {bill.payee ? <span className="font-normal text-fg-muted"> · {bill.payee}</span> : null}
              </div>
            </Link>
            <div className="shrink-0 text-right text-lg font-extrabold tabular-nums text-fg">{formatINR(bill.amountPaise, { whole: bill.amountPaise % 100 === 0 })}</div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={bill.priority} />
            <Badge className="px-2">{BILL_KIND_LABEL[bill.kind]}</Badge>
            {bill.canMove && bill.latestDate ? (
              <Badge tone="violet" className="px-2">
                <CalendarClock className="h-3 w-3" /> can move until {formatDay(bill.latestDate, { short: true })}
              </Badge>
            ) : null}
            {bill.recurrence ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted"><Repeat className="h-3 w-3" />{describeRecurrence(bill.recurrence)}</span>
            ) : null}
            {bill.accountName ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted"><Wallet className="h-3 w-3" />{bill.accountName}</span>
            ) : null}
            <WorkspaceBadge ws={bill.workspace} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <PayBillDialog bill={bill} accounts={accounts} categories={categories} />
            {bill.canMove && (!bill.latestDate || bill.latestDate > bill.dueDate) ? <MoveBillDialog bill={bill} /> : null}
            <SkipBillButton bill={bill} />
          </div>
        </div>
      </div>
    </div>
  );
}
