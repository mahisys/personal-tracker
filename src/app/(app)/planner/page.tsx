import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowRight, CalendarCheck2, CalendarClock, FileText, Landmark, Plus, ShieldCheck, Sparkles, TrendingDown, Wallet } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { getCashForecast } from "@/server/planner/forecast";
import { listRecentlyPaid, listRenewals, listUpcomingBills } from "@/server/planner/queries";
import { applySuggestions } from "@/server/planner/actions";
import { groupBills, renewalUrgency } from "@/server/planner/bills";
import { listAccountOptions, listCategories } from "@/server/books/queries";
import { addDays, formatDay, relativeDay, todayIST } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";
import { cn } from "@/lib/cn";
import { PageHeader, EmptyState, Section } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { AnimatedNumber } from "@/components/client/animated-number";
import { BillDialog } from "@/components/planner/bill-dialog";
import { BillCard, PlannerNav } from "@/components/planner/bill-card";
import { ForecastChart } from "@/components/planner/forecast-chart";
import type { AccountOption, CategoryOption } from "@/components/books/transaction-dialog";

const HORIZONS = [30, 60, 90] as const;

export default async function PlannerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const daysParam = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const horizon = HORIZONS.includes(daysParam as (typeof HORIZONS)[number]) ? daysParam : 90;
  const ws = await getWorkspaceFilter();
  const today = todayIST();

  const [forecast, upcoming, paid, renewals, accountRows, categoryRows] = await Promise.all([
    getCashForecast({ days: horizon, workspace: ws, today }),
    listUpcomingBills(ws),
    listRecentlyPaid(ws, 5),
    listRenewals(ws),
    listAccountOptions(),
    listCategories(),
  ]);
  const accounts = accountRows as AccountOption[];
  const categories = categoryRows as CategoryOption[];

  const groups = groupBills(upcoming, today);
  const in30 = addDays(today, 29);
  const due30 = upcoming.filter((b) => b.dueDate <= in30).reduce((s, b) => s + b.amountPaise, 0);
  const inflows = forecast.days.flatMap((d) => d.items.filter((i) => i.kind !== "bill").map((i) => ({ ...i, date: d.date })));
  const inflowTotal = inflows.reduce((s, i) => s + i.amountPaise, 0);
  const soonRenewals = renewals.filter((r) => r.expiresOn <= addDays(today, Math.max(45, r.remindDaysBefore))).slice(0, 4);
  const below = forecast.lowest.balancePaise < forecast.minBalancePaise;

  return (
    <>
      <PageHeader
        eyebrow="Money"
        title="Planner"
        description="What's coming up, and whether your cash comfortably covers it."
        actions={
          <BillDialog key={String(sp.new)} trigger={<><Plus className="h-4 w-4" /> Plan a payment</>} accounts={accounts} categories={categories} defaults={{ workspace: ws ?? "personal" }} defaultOpen={sp.new === "1"} />
        }
      />
      <PlannerNav active="/planner" />

      <div className="stagger mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Cash today" value={<AnimatedNumber value={forecast.startBalancePaise} format="inr" />} sub="Bank, cash, UPI & wallets" icon={<Wallet className="h-5 w-5" />} tone="brand" href="/books/accounts" className="col-span-2 lg:col-span-1" />
        <StatTile label="Due in 30 days" value={formatINRShort(due30)} sub={`${upcoming.filter((b) => b.dueDate <= in30).length} payments`} icon={<CalendarClock className="h-5 w-5" />} tone="warn" />
        <StatTile label={`Coming in · ${horizon}d`} value={formatINRShort(inflowTotal)} sub="Invoices & DSA payouts" icon={<ArrowDownLeft className="h-5 w-5" />} tone="good" />
        <StatTile label="Lowest point" value={<span className={below ? "text-rose-600 dark:text-rose-400" : undefined}>{formatINRShort(forecast.lowest.balancePaise)}</span>} sub={formatDay(forecast.lowest.date, { short: true })} icon={<TrendingDown className="h-5 w-5" />} tone={below ? "bad" : "good"} />
      </div>

      <Card className="mb-6 animate-fade-up">
        <CardHeader
          title="Cash-flow forecast"
          description={`Projected balance for the next ${horizon} days · cushion ${formatINR(forecast.minBalancePaise, { whole: true })}`}
          actions={
            <div className="flex rounded-xl bg-muted p-0.5" role="tablist" aria-label="Forecast horizon">
              {HORIZONS.map((h) => (
                <Link key={h} href={`/planner?days=${h}`} scroll={false} role="tab" aria-selected={h === horizon} className={cn("rounded-lg px-2.5 py-1 text-xs font-bold transition", h === horizon ? "bg-solid text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
                  {h}d
                </Link>
              ))}
            </div>
          }
        />
        <CardBody>
          <ForecastChart days={forecast.days} minBalancePaise={forecast.minBalancePaise} lowest={forecast.lowest} />

          {forecast.shortfall ? (
            <div className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-4 animate-pop-in">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-300">
                  <AlertTriangle className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-fg">
                    Cash dips below your cushion {relativeDay(forecast.shortfall.firstDate, today).toLowerCase()} ({formatDay(forecast.shortfall.firstDate, { short: true })})
                  </div>
                  <p className="text-sm text-fg-muted">
                    At the lowest you&apos;d be {formatINR(forecast.shortfall.amountPaise, { whole: true })} short of {formatINR(forecast.minBalancePaise, { whole: true })}.
                    {forecast.suggestions.length ? " Here's a gentle way through:" : " Nothing flexible to move — chasing an invoice may help."}
                  </p>
                </div>
              </div>
              {forecast.suggestions.length ? (
                <>
                  <ul className="mt-3 space-y-2">
                    {forecast.suggestions.map((s) => (
                      <li key={s.billId} className="flex flex-col gap-2 rounded-xl bg-solid/70 px-3 py-2.5 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1 text-sm">
                          <span className="font-semibold text-fg">Move {s.title}</span>{" "}
                          <span className="tabular-nums text-fg-muted">({formatINRShort(s.amountPaise)})</span>
                          <span className="ml-1 inline-flex items-center gap-1 text-fg-muted">
                            {formatDay(s.fromDate, { short: true })} <ArrowRight className="h-3 w-3" /> <span className="font-semibold text-fg">{formatDay(s.toDate, { short: true })}</span>
                          </span>
                        </div>
                        <ActionButton action={applySuggestions} hidden={{ billId: s.billId, toDate: s.toDate }} variant="soft" size="sm">
                          Apply suggestion
                        </ActionButton>
                      </li>
                    ))}
                  </ul>
                  {forecast.suggestions.length > 1 ? (
                    <ActionForm action={applySuggestions} className="mt-3 flex justify-end">
                      {forecast.suggestions.map((s) => (
                        <span key={s.billId}>
                          <input type="hidden" name="billId" value={s.billId} />
                          <input type="hidden" name="toDate" value={s.toDate} />
                        </span>
                      ))}
                      <SubmitButton size="sm" pendingText="Moving…"><Sparkles className="h-3.5 w-3.5" /> Apply all {forecast.suggestions.length}</SubmitButton>
                    </ActionForm>
                  ) : null}
                </>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/invoices" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"><FileText className="h-4 w-4" /> Open invoices</Link>
                  <Link href="/dsa/payouts" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"><Landmark className="h-4 w-4" /> DSA payouts</Link>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-500/[0.07] p-4 text-sm">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
              <span className="text-fg">
                <span className="font-bold">You&apos;re covered.</span> <span className="text-fg-muted">Cash stays above your cushion for the next {horizon} days.</span>
              </span>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {groups.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck2 className="h-6 w-6" />}
              title="All caught up"
              description="No payments planned. Add rent, EMIs, subscriptions or vendor bills and we'll keep an eye on them."
              action={<BillDialog trigger={<><Plus className="h-4 w-4" /> Plan a payment</>} accounts={accounts} categories={categories} defaults={{ workspace: ws ?? "personal" }} />}
            />
          ) : (
            groups.map((g) => {
              const total = g.items.reduce((s, b) => s + b.amountPaise, 0);
              return (
                <Section
                  key={g.key}
                  title={<span className={g.key === "overdue" ? "text-rose-600 dark:text-rose-400" : undefined}>{g.label} · {g.items.length}</span>}
                  actions={<span className="text-sm font-bold tabular-nums text-fg-muted">{formatINR(total, { whole: true })}</span>}
                >
                  <div className="stagger space-y-3">
                    {g.items.map((b) => (
                      <BillCard key={b.id} bill={b} today={today} accounts={accounts} categories={categories} />
                    ))}
                  </div>
                </Section>
              );
            })
          )}
        </div>

        <aside className="space-y-4">
          <Card className="animate-fade-up">
            <CardHeader title="Coming in" description={`Expected in the next ${horizon} days`} icon={<ArrowDownLeft className="h-4.5 w-4.5" />} />
            <CardBody className="space-y-2">
              {inflows.length === 0 ? (
                <p className="text-sm text-fg-subtle">No invoices or payouts expected yet.</p>
              ) : (
                inflows.slice(0, 8).map((i, idx) => (
                  <Link key={`${i.id}-${idx}`} href={i.kind === "invoice" ? `/invoices/${i.id}` : "/dsa/payouts"} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-muted">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", i.kind === "invoice" ? "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300" : "bg-amber-500/12 text-amber-700 dark:text-amber-300")}>
                      {i.kind === "invoice" ? <FileText className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{i.label}</span>
                      <span className="text-xs text-fg-muted">{relativeDay(i.date, today)}</span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+{formatINRShort(i.amountPaise)}</span>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card className="animate-fade-up">
            <CardHeader title="Renewals" description="Documents & policies expiring soon" icon={<CalendarClock className="h-4.5 w-4.5" />} actions={<Link href="/planner/renewals" className="text-sm font-semibold text-brand hover:underline">All</Link>} />
            <CardBody className="space-y-2">
              {soonRenewals.length === 0 ? (
                <p className="text-sm text-fg-subtle">Nothing expiring soon.</p>
              ) : (
                soonRenewals.map((r) => {
                  const u = renewalUrgency(r.expiresOn, today, r.remindDaysBefore);
                  return (
                    <Link key={r.id} href="/planner/renewals" className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 transition hover:bg-muted">
                      <span className="min-w-0 truncate text-sm font-semibold text-fg">{r.name}</span>
                      <Badge tone={u.tone}>{u.label}</Badge>
                    </Link>
                  );
                })
              )}
            </CardBody>
          </Card>

          {paid.length ? (
            <Card className="animate-fade-up">
              <CardHeader title="Recently paid" icon={<CalendarCheck2 className="h-4.5 w-4.5" />} />
              <CardBody className="space-y-2">
                {paid.map((b) => (
                  <Link key={b.id} href={`/planner/bills/${b.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 transition hover:bg-muted">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-fg">{b.title}</span>
                      <span className="text-xs text-fg-muted">{formatDay(b.paidDate, { short: true })}</span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-fg-muted">{formatINRShort(b.amountPaise)}</span>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
