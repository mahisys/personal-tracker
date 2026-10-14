import { PieChart } from "lucide-react";
import { getWorkspaceFilter } from "@/server/workspace";
import { getAvailableFys, getExpensesByCategory } from "@/server/reports/queries";
import { fyRange, fyStartYear } from "@/server/reports/aggregate";
import { fyOptions, monthOptions, parseFy, parseMonth } from "@/server/reports/params";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { Progress } from "@/components/ui/stat";
import { LinkButton } from "@/components/ui/button";
import { DonutChart } from "@/components/reports/charts";
import { ParamSelect, ParamToggle } from "@/components/reports/report-nav";
import { endOfMonth, formatMonth, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export default async function ExpensesReportPage({ searchParams }: { searchParams: Promise<{ period?: string; month?: string; fy?: string }> }) {
  const sp = await searchParams;
  const today = todayIST();
  const byFy = sp.period === "fy";
  const month = parseMonth(sp.month, today);
  const year = parseFy(sp.fy, today);
  const ws = await getWorkspaceFilter();
  const period = byFy ? fyRange(year) : { start: `${month}-01`, end: endOfMonth(`${month}-01`), label: formatMonth(month) };
  const [data, years] = await Promise.all([getExpensesByCategory({ from: period.start, to: period.end }, ws), byFy ? getAvailableFys(fyStartYear(today)) : Promise.resolve([])]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ParamToggle
          param="period"
          value={byFy ? "fy" : "month"}
          options={[
            { value: "month", label: "Month" },
            { value: "fy", label: "Financial year" },
          ]}
        />
        {byFy ? (
          <ParamSelect param="fy" label="Financial year" value={String(year)} options={fyOptions(years)} />
        ) : (
          <ParamSelect param="month" label="Month" value={month} options={monthOptions(today)} />
        )}
      </div>

      {data.slices.length ? (
        <>
          <Card>
            <CardHeader title={`Where the money went · ${period.label}`} description={`${formatINR(data.totalPaise, { whole: true })} across ${data.slices.length} categories`} icon={<PieChart className="h-4.5 w-4.5" />} />
            <CardBody>
              <DonutChart slices={data.slices} total={data.totalPaise} />
            </CardBody>
          </Card>
          <TableWrap>
            <Table className="min-w-[480px]">
              <THead>
                <tr>
                  <TH>Category</TH>
                  <TH className="w-1/3">Share</TH>
                  <TH className="text-right">Amount</TH>
                </tr>
              </THead>
              <tbody>
                {data.slices.map((s) => (
                  <TR key={s.name}>
                    <TD className="font-semibold">{s.name}</TD>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Progress value={s.share} tone="bad" className="h-1.5" />
                        <span className="w-12 text-right text-xs tabular-nums text-fg-muted">{s.share}%</span>
                      </div>
                    </TD>
                    <TD className="text-right font-bold tabular-nums">{formatINR(s.amountPaise, { whole: true })}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </>
      ) : (
        <EmptyState
          icon={<PieChart className="h-6 w-6" />}
          title={`No expenses in ${period.label}`}
          description="Nothing spent — or nothing recorded yet. Add expenses in Books to see the breakdown."
          action={<LinkButton href="/books?new=expense">Add an expense</LinkButton>}
        />
      )}
    </div>
  );
}
