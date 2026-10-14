import { ArrowDownRight, ArrowUpRight, Percent, Scale } from "lucide-react";
import { WORKSPACE_KEYS } from "@/db/schema";
import { getWorkspaceFilter } from "@/server/workspace";
import { getAvailableFys, getPnl } from "@/server/reports/queries";
import { fyRange, fyStartYear } from "@/server/reports/aggregate";
import { fyOptions, monthShort, parseFy } from "@/server/reports/params";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/page";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { PnlChart } from "@/components/reports/charts";
import { ParamSelect } from "@/components/reports/report-nav";
import { formatINR, formatINRShort } from "@/lib/money";
import { formatMonth, todayIST } from "@/lib/dates";
import { cn } from "@/lib/cn";

function Money({ v, signed }: { v: number; signed?: boolean }) {
  return <span className={cn("tabular-nums", signed && (v < 0 ? "text-bad" : v > 0 ? "text-emerald-600 dark:text-emerald-300" : ""))}>{formatINR(v, { whole: true })}</span>;
}

export default async function ProfitAndLossPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const { fy } = await searchParams;
  const today = todayIST();
  const year = parseFy(fy, today);
  const ws = await getWorkspaceFilter();
  const [pnl, years] = await Promise.all([getPnl(year, ws), getAvailableFys(fyStartYear(today))]);
  const { label } = fyRange(year);
  const t = pnl.total;
  const margin = t.income ? Math.round((t.net / t.income) * 100) : 0;
  const elapsed = pnl.months.filter((m) => `${m.month}-01` <= today);
  const best = [...elapsed].sort((a, b) => b.net - a.net)[0];
  const visibleWs = ws ? [ws] : WORKSPACE_KEYS;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Cash basis — money that actually came in and went out{ws ? "" : ", all workspaces"}.</p>
        <ParamSelect param="fy" label="Financial year" value={String(year)} options={fyOptions(years)} />
      </div>

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Income · ${label}`} value={formatINRShort(t.income)} icon={<ArrowDownRight className="h-5 w-5" />} tone="good" />
        <StatTile label="Expenses" value={formatINRShort(t.expense)} icon={<ArrowUpRight className="h-5 w-5" />} tone="bad" />
        <StatTile label="Net profit" value={formatINRShort(t.net)} icon={<Scale className="h-5 w-5" />} tone={t.net >= 0 ? "brand" : "bad"} sub={best && best.net > 0 ? `Best month: ${formatMonth(best.month)}` : undefined} />
        <StatTile label="Margin" value={`${margin}%`} icon={<Percent className="h-5 w-5" />} tone={margin >= 20 ? "good" : margin >= 0 ? "warn" : "bad"} sub="net ÷ income" />
      </div>

      <Card>
        <CardHeader title="Month by month" description={`${label} · income, expense and net`} />
        <CardBody>
          {t.income || t.expense ? (
            <PnlChart data={pnl.months.map((m) => ({ label: monthShort(m.month), income: m.income, expense: m.expense, net: m.net }))} />
          ) : (
            <EmptyState title="No money recorded in this year yet" description="Add income and expenses in Books and your P&L draws itself here." className="py-10" />
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Month</TH>
                <TH className="text-right">Income</TH>
                <TH className="text-right">Expense</TH>
                <TH className="text-right">Net</TH>
              </tr>
            </THead>
            <tbody>
              {pnl.months.map((m) => (
                <TR key={m.month} className={cn(`${m.month}-01` > today && "opacity-45")}>
                  <TD className="font-semibold">{formatMonth(m.month)}</TD>
                  <TD className="text-right">
                    <Money v={m.income} />
                  </TD>
                  <TD className="text-right">
                    <Money v={m.expense} />
                  </TD>
                  <TD className="text-right font-bold">
                    <Money v={m.net} signed />
                  </TD>
                </TR>
              ))}
              <tr className="bg-muted/60 font-extrabold">
                <TD>Total</TD>
                <TD className="text-right">
                  <Money v={t.income} />
                </TD>
                <TD className="text-right">
                  <Money v={t.expense} />
                </TD>
                <TD className="text-right">
                  <Money v={t.net} signed />
                </TD>
              </tr>
            </tbody>
          </Table>
        </TableWrap>

        <Card>
          <CardHeader title="By workspace" description={label} />
          <CardBody className="space-y-3">
            {visibleWs.map((k) => {
              const w = pnl.byWorkspace[k];
              return (
                <div key={k} className="rounded-2xl border border-line bg-solid/50 p-4">
                  <div className="flex items-center justify-between">
                    <WorkspaceBadge ws={k} />
                    <span className="text-lg font-extrabold">
                      <Money v={w.net} signed />
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-fg-muted">
                    <span>In {formatINR(w.income, { whole: true })}</span>
                    <span>Out {formatINR(w.expense, { whole: true })}</span>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
