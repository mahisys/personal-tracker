import { PiggyBank, Target } from "lucide-react";
import { getWorkspaceFilter } from "@/server/workspace";
import { getBudget } from "@/server/reports/queries";
import { monthOptions, parseMonth } from "@/server/reports/params";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { Progress, ProgressRing, StatTile } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { ParamSelect } from "@/components/reports/report-nav";
import { diffDays, formatMonth, todayIST } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";

export default async function BudgetReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: m } = await searchParams;
  const today = todayIST();
  const month = parseMonth(m, today);
  const ws = await getWorkspaceFilter();
  const b = await getBudget(month, ws);
  const totalBudget = b.lines.reduce((s, l) => s + l.budgetPaise, 0);
  const totalActual = b.lines.reduce((s, l) => s + l.actualPaise, 0);
  const over = b.lines.filter((l) => l.status === "over").length;
  const isCurrent = month === today.slice(0, 7);
  const monthPct = isCurrent ? Math.round(((diffDays(b.from, today) + 1) / (diffDays(b.from, b.to) + 1)) * 100) : 100;
  const usedPct = totalBudget ? Math.round((totalActual / totalBudget) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Monthly budgets set on expense categories, compared with what you actually spent.</p>
        <ParamSelect param="month" label="Month" value={month} options={monthOptions(today)} />
      </div>

      {b.lines.length === 0 ? (
        <EmptyState
          icon={<PiggyBank className="h-6 w-6" />}
          title="No budgets yet"
          description="Give a few categories a monthly budget — groceries, fuel, software — and we'll keep a gentle eye on them."
          action={<LinkButton href="/books/categories">Set budgets</LinkButton>}
        />
      ) : (
        <>
          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="flex items-center gap-4 p-5">
              <ProgressRing value={usedPct} size={76} label={`${usedPct}%`} sub="used" />
              <div>
                <div className="text-xs font-semibold text-fg-muted">{formatMonth(month)}</div>
                <div className="text-lg font-extrabold tabular-nums">
                  {formatINRShort(totalActual)} <span className="text-sm font-semibold text-fg-subtle">of {formatINRShort(totalBudget)}</span>
                </div>
                {isCurrent ? <div className="text-xs text-fg-muted">{monthPct}% of the month gone</div> : null}
              </div>
            </Card>
            <StatTile label="Left to spend" value={formatINRShort(Math.max(0, totalBudget - totalActual))} icon={<Target className="h-5 w-5" />} tone={totalActual > totalBudget ? "bad" : "good"} />
            <StatTile label="Over budget" value={over} sub={over ? "categories need a look" : "Nicely within budget"} tone={over ? "bad" : "good"} />
          </div>

          <Card>
            <CardHeader title="Category by category" description="Bars turn amber near the limit and rose when over" />
            <CardBody className="stagger space-y-4">
              {b.lines.map((l) => (
                <div key={l.id}>
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-fg">{l.name}</span>
                    <span className="flex items-center gap-2 text-xs tabular-nums text-fg-muted">
                      <span className="font-bold text-fg">{formatINR(l.actualPaise, { whole: true })}</span> / {formatINR(l.budgetPaise, { whole: true })}
                      <Badge tone={l.status === "over" ? "bad" : l.status === "near" ? "warn" : "good"}>
                        {l.status === "over" ? `${formatINRShort(-l.remainingPaise)} over` : `${formatINRShort(l.remainingPaise)} left`}
                      </Badge>
                    </span>
                  </div>
                  <Progress value={l.pct} tone={l.status === "over" ? "bad" : l.status === "near" ? "warn" : "good"} />
                </div>
              ))}
            </CardBody>
          </Card>
        </>
      )}

      {b.unbudgeted.length ? (
        <Card>
          <CardHeader title="Spending without a budget" description="Consider adding budgets for the big ones" />
          <CardBody>
            <ul className="divide-y divide-line">
              {b.unbudgeted.slice(0, 8).map((u) => (
                <li key={u.id} className="flex justify-between py-2 text-sm">
                  <span className="font-semibold">{u.name}</span>
                  <span className="tabular-nums text-fg-muted">{formatINR(u.actualPaise, { whole: true })}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
