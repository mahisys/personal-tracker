import { Landmark, Receipt, ReceiptIndianRupee, Scale } from "lucide-react";
import { getWorkspaceFilter } from "@/server/workspace";
import { getAvailableFys, getGstSummary } from "@/server/reports/queries";
import { fyRange, fyStartYear } from "@/server/reports/aggregate";
import { fyOptions, monthShort, parseFy } from "@/server/reports/params";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { GstChart } from "@/components/reports/charts";
import { ParamSelect } from "@/components/reports/report-nav";
import { formatMonth, todayIST } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";
import { cn } from "@/lib/cn";

const fmt = (v: number) => (v ? formatINR(v, { whole: true }) : "—");

export default async function GstReportPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const { fy } = await searchParams;
  const today = todayIST();
  const year = parseFy(fy, today);
  const ws = await getWorkspaceFilter();
  const [g, years] = await Promise.all([getGstSummary(year, ws), getAvailableFys(fyStartYear(today))]);
  const { label } = fyRange(year);
  const t = g.total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-fg-muted">Output GST from invoices issued vs input GST on expenses. A helpful estimate for GSTR-3B — confirm with your CA before filing.</p>
        <ParamSelect param="fy" label="Financial year" value={String(year)} options={fyOptions(years)} />
      </div>

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Taxable sales · ${label}`} value={formatINRShort(t.taxablePaise)} icon={<Receipt className="h-5 w-5" />} tone="brand" />
        <StatTile label="Output GST" value={formatINRShort(t.outputPaise)} icon={<ReceiptIndianRupee className="h-5 w-5" />} tone="violet" sub={`CGST ${formatINRShort(t.cgstPaise)} · SGST ${formatINRShort(t.sgstPaise)} · IGST ${formatINRShort(t.igstPaise)}`} />
        <StatTile label="Input credit" value={formatINRShort(t.inputPaise)} icon={<Landmark className="h-5 w-5" />} tone="good" />
        <StatTile label={t.netPaise >= 0 ? "Net payable" : "Credit carried"} value={formatINRShort(Math.abs(t.netPaise))} icon={<Scale className="h-5 w-5" />} tone={t.netPaise > 0 ? "warn" : "good"} />
      </div>

      <Card>
        <CardHeader title="Month by month" description={label} />
        <CardBody>
          <GstChart data={g.months.map((m) => ({ label: monthShort(m.month), output: m.outputPaise, input: m.inputPaise }))} />
        </CardBody>
      </Card>

      <TableWrap>
        <Table className="min-w-[820px]">
          <THead>
            <tr>
              <TH>Month</TH>
              <TH className="text-right">Taxable</TH>
              <TH className="text-right">CGST</TH>
              <TH className="text-right">SGST</TH>
              <TH className="text-right">IGST</TH>
              <TH className="text-right">Output</TH>
              <TH className="text-right">Input</TH>
              <TH className="text-right">Net payable</TH>
            </tr>
          </THead>
          <tbody>
            {g.months.map((m) => (
              <TR key={m.month} className={cn(`${m.month}-01` > today && "opacity-45")}>
                <TD className="font-semibold">{formatMonth(m.month)}</TD>
                <TD className="text-right tabular-nums">{fmt(m.taxablePaise)}</TD>
                <TD className="text-right tabular-nums">{fmt(m.cgstPaise)}</TD>
                <TD className="text-right tabular-nums">{fmt(m.sgstPaise)}</TD>
                <TD className="text-right tabular-nums">{fmt(m.igstPaise)}</TD>
                <TD className="text-right font-semibold tabular-nums">{fmt(m.outputPaise)}</TD>
                <TD className="text-right tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(m.inputPaise)}</TD>
                <TD className={cn("text-right font-bold tabular-nums", m.netPaise < 0 && "text-emerald-700 dark:text-emerald-300")}>
                  {m.netPaise < 0 ? `(${formatINR(-m.netPaise, { whole: true })})` : fmt(m.netPaise)}
                </TD>
              </TR>
            ))}
            <tr className="bg-muted/60 font-extrabold">
              <TD>Total</TD>
              <TD className="text-right tabular-nums">{fmt(t.taxablePaise)}</TD>
              <TD className="text-right tabular-nums">{fmt(t.cgstPaise)}</TD>
              <TD className="text-right tabular-nums">{fmt(t.sgstPaise)}</TD>
              <TD className="text-right tabular-nums">{fmt(t.igstPaise)}</TD>
              <TD className="text-right tabular-nums">{fmt(t.outputPaise)}</TD>
              <TD className="text-right tabular-nums">{fmt(t.inputPaise)}</TD>
              <TD className="text-right tabular-nums">{t.netPaise < 0 ? `(${formatINR(-t.netPaise, { whole: true })})` : fmt(t.netPaise)}</TD>
            </tr>
          </tbody>
        </Table>
      </TableWrap>
      <p className="text-xs text-fg-subtle">Figures in brackets are input credit exceeding output — carried forward.</p>
    </div>
  );
}
