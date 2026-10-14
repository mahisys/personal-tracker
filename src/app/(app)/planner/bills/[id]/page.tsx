import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BellRing, CheckCircle2, CircleDashed, History as HistoryIcon, Pencil, SkipForward, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getBill, getSeries } from "@/server/planner/queries";
import { deleteBill } from "@/server/planner/actions";
import { BILL_KIND_LABEL } from "@/server/planner/bills";
import { listAccountOptions, listCategories } from "@/server/books/queries";
import { describeRecurrence } from "@/lib/recurrence";
import { formatDay, relativeDay, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/client/action-form";
import { Attachments } from "@/components/shared/attachments";
import { History } from "@/components/shared/history";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { BillDialog } from "@/components/planner/bill-dialog";
import { PriorityBadge } from "@/components/planner/bill-card";
import { MoveBillDialog, PayBillDialog, SkipBillButton } from "@/components/planner/bill-actions";
import type { AccountOption, CategoryOption } from "@/components/books/transaction-dialog";

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const bill = await getBill(id);
  if (!bill) notFound();
  const [series, accountRows, categoryRows] = await Promise.all([getSeries(bill), listAccountOptions(), listCategories()]);
  const accounts = accountRows as AccountOption[];
  const categories = categoryRows as CategoryOption[];
  const today = todayIST();
  const upcoming = bill.status === "upcoming";
  const overdue = upcoming && bill.dueDate < today;
  const paidTotal = series.filter((s) => s.payment).reduce((sum, s) => sum + (s.payment?.amountPaise ?? 0), 0);
  const paidCount = series.filter((s) => s.status === "paid").length;

  const details: [string, React.ReactNode][] = [
    ["Kind", BILL_KIND_LABEL[bill.kind]],
    ["Pay to", bill.payee ?? "—"],
    ["Pay from", bill.accountName ?? "Decide when paying"],
    ["Category", bill.categoryName ?? "—"],
    ["Repeats", describeRecurrence(bill.recurrence)],
    ["Can move", bill.canMove ? (bill.latestDate ? `Until ${formatDay(bill.latestDate)}` : "Yes") : "No — fixed date"],
    ["Reminders", bill.remindDaysBefore.length ? bill.remindDaysBefore.map((d) => (d === 0 ? "on the day" : `${d}d before`)).join(", ") : "None"],
  ];

  return (
    <>
      <Link href="/planner" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-fg-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Planner
      </Link>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            {BILL_KIND_LABEL[bill.kind]} <WorkspaceBadge ws={bill.workspace} />
          </span>
        }
        title={bill.title}
        description={
          upcoming
            ? `${formatINR(bill.amountPaise)} due ${formatDay(bill.dueDate)} (${relativeDay(bill.dueDate, today).toLowerCase()})`
            : bill.status === "paid"
              ? `Paid ${formatINR(bill.amountPaise)} on ${formatDay(bill.paidDate)}`
              : `Skipped — was due ${formatDay(bill.dueDate)}`
        }
        actions={
          <>
            {upcoming ? <PayBillDialog bill={bill} accounts={accounts} categories={categories} size="md" /> : null}
            {upcoming && bill.canMove ? <MoveBillDialog bill={bill} size="md" /> : null}
            {upcoming ? <SkipBillButton bill={bill} /> : null}
            <BillDialog
              trigger={<><Pencil className="h-4 w-4" /> Edit</>}
              variant="secondary"
              accounts={accounts}
              categories={categories}
              defaults={{ ...bill, notes: bill.notes }}
            />
            <ActionButton action={deleteBill} hidden={{ id: bill.id, redirect: "/planner" }} variant="danger" size="md" confirm="Delete this payment? Any recorded expense stays in your books." title="Delete">
              <Trash2 className="h-4 w-4" />
            </ActionButton>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className={cn("overflow-hidden animate-fade-up", overdue && "border-rose-500/30")}>
            <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Amount</div>
                <div className="text-3xl font-extrabold tabular-nums text-fg">{formatINR(bill.amountPaise)}</div>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <PriorityBadge priority={bill.priority} />
                {bill.status === "paid" ? <Badge tone="good">Paid</Badge> : bill.status === "skipped" ? <Badge>Skipped</Badge> : overdue ? <Badge tone="bad">Overdue</Badge> : <Badge tone="brand">Upcoming</Badge>}
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2">
              {details.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 sm:block">
                  <dt className="text-xs font-semibold text-fg-subtle">{k}</dt>
                  <dd className="text-sm font-medium text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            {bill.notes ? <p className="border-t border-line px-5 py-4 text-sm whitespace-pre-wrap text-fg-muted">{bill.notes}</p> : null}
            {bill.remindDaysBefore.length && upcoming ? (
              <p className="flex items-center gap-1.5 border-t border-line px-5 py-3 text-xs text-fg-muted"><BellRing className="h-3.5 w-3.5" /> We&apos;ll nudge you before it&apos;s due.</p>
            ) : null}
          </Card>

          <Card className="animate-fade-up">
            <CardHeader
              title="Payment history"
              description={paidCount ? `${paidCount} paid · ${formatINR(paidTotal, { whole: true })} in total` : "Nothing paid yet"}
              icon={<HistoryIcon className="h-4.5 w-4.5" />}
            />
            <CardBody>
              <ol className="stagger space-y-2">
                {series.map((s) => (
                  <li key={s.id}>
                    <Link href={`/planner/bills/${s.id}`} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-muted", s.id === bill.id && "bg-brand-soft/60")}>
                      {s.status === "paid" ? (
                        <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-500" />
                      ) : s.status === "skipped" ? (
                        <SkipForward className="h-4.5 w-4.5 shrink-0 text-fg-subtle" />
                      ) : (
                        <CircleDashed className="h-4.5 w-4.5 shrink-0 text-brand" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-fg">Due {formatDay(s.dueDate)}</span>
                        <span className="text-xs text-fg-muted">
                          {s.status === "paid"
                            ? `Paid ${formatDay(s.paidDate)}${s.payment ? ` from ${s.payment.accountName}` : ""}${s.paidDate && s.paidDate < s.dueDate ? " · early" : s.paidDate && s.paidDate > s.dueDate ? " · late" : ""}`
                            : s.status === "skipped"
                              ? "Skipped"
                              : relativeDay(s.dueDate, today)}
                        </span>
                      </span>
                      <span className={cn("text-sm font-bold tabular-nums", s.status === "paid" ? "text-fg" : "text-fg-muted")}>{formatINR(s.payment?.amountPaise ?? s.amountPaise)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
              {bill.paidTransactionId ? (
                <Link href={`/books/transactions?billId=${bill.id}&from=&to=`} className="mt-3 inline-block text-xs font-semibold text-brand hover:underline">See it in your books</Link>
              ) : null}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Attachments entityType="bill" entityId={bill.id} path={`/planner/bills/${bill.id}`} />
          <History entityType="bill" entityId={bill.id} />
        </div>
      </div>
    </>
  );
}
