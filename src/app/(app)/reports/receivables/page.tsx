import Link from "next/link";
import { AlarmClock, HandCoins, PartyPopper, Wallet } from "lucide-react";
import { getWorkspaceFilter } from "@/server/workspace";
import { getReceivables } from "@/server/reports/queries";
import { AGEING_BUCKETS, AGEING_LABELS } from "@/server/reports/aggregate";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { StatTile } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { AgeingChart } from "@/components/reports/charts";
import { diffDays, formatDay, todayIST } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";

export default async function ReceivablesPage() {
  const today = todayIST();
  const ws = await getWorkspaceFilter();
  const r = await getReceivables(today, ws);

  if (!r.totalPaise) {
    return (
      <EmptyState
        icon={<PartyPopper className="h-6 w-6" />}
        title="Nobody owes you anything"
        description="Every invoice is paid up. Lovely work — that's healthy cash flow."
      />
    );
  }

  const oldest = r.invoices.length ? diffDays(r.invoices[0].dueDate, today) : 0;
  return (
    <div className="space-y-6">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total receivable" value={formatINRShort(r.totalPaise)} icon={<Wallet className="h-5 w-5" />} tone="brand" sub={`${r.invoices.length} open invoice${r.invoices.length === 1 ? "" : "s"}`} />
        <StatTile label="Overdue" value={formatINRShort(r.overduePaise)} icon={<AlarmClock className="h-5 w-5" />} tone={r.overduePaise ? "bad" : "good"} sub={r.totalPaise ? `${Math.round((r.overduePaise / r.totalPaise) * 100)}% of receivables` : undefined} />
        <StatTile label="90+ days" value={formatINRShort(r.totals["90_plus"])} tone={r.totals["90_plus"] ? "bad" : "good"} sub="hardest to collect" />
        <StatTile label="Oldest" value={oldest > 0 ? `${oldest}d` : "On time"} icon={<HandCoins className="h-5 w-5" />} tone={oldest > 30 ? "warn" : "good"} sub="past due" />
      </div>

      <Card>
        <CardHeader title="Ageing" description="Outstanding balance by days past the due date" />
        <CardBody>
          <AgeingChart data={AGEING_BUCKETS.map((b) => ({ label: AGEING_LABELS[b], amountPaise: r.totals[b] }))} />
        </CardBody>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-fg-muted">By client</h2>
        <TableWrap>
          <Table className="min-w-[760px]">
            <THead>
              <tr>
                <TH>Client</TH>
                {AGEING_BUCKETS.map((b) => (
                  <TH key={b} className="text-right">
                    {AGEING_LABELS[b]}
                  </TH>
                ))}
                <TH className="text-right">Total</TH>
              </tr>
            </THead>
            <tbody>
              {r.clients.map((c) => (
                <TR key={c.key}>
                  <TD>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-fg-subtle">
                      {c.invoices} invoice{c.invoices === 1 ? "" : "s"}
                      {c.oldestDays > 0 ? ` · oldest ${c.oldestDays}d late` : ""}
                    </div>
                  </TD>
                  {AGEING_BUCKETS.map((b) => (
                    <TD key={b} className={`text-right tabular-nums ${c.buckets[b] ? (b === "90_plus" || b === "61_90" ? "font-bold text-bad" : "") : "text-fg-subtle"}`}>
                      {c.buckets[b] ? formatINR(c.buckets[b], { whole: true }) : "—"}
                    </TD>
                  ))}
                  <TD className="text-right font-extrabold tabular-nums">{formatINR(c.totalPaise, { whole: true })}</TD>
                </TR>
              ))}
              <tr className="bg-muted/60 font-extrabold">
                <TD>Total</TD>
                {AGEING_BUCKETS.map((b) => (
                  <TD key={b} className="text-right tabular-nums">
                    {formatINR(r.totals[b], { whole: true })}
                  </TD>
                ))}
                <TD className="text-right tabular-nums">{formatINR(r.totalPaise, { whole: true })}</TD>
              </tr>
            </tbody>
          </Table>
        </TableWrap>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-fg-muted">Open invoices</h2>
        <TableWrap>
          <Table className="min-w-[560px]">
            <THead>
              <tr>
                <TH>Invoice</TH>
                <TH>Client</TH>
                <TH>Due</TH>
                <TH className="text-right">Balance</TH>
              </tr>
            </THead>
            <tbody>
              {r.invoices.map((i) => {
                const late = diffDays(i.dueDate, today);
                return (
                  <TR key={i.id}>
                    <TD>
                      <Link href={`/invoices/${i.id}`} className="font-bold text-brand hover:underline">
                        {i.number}
                      </Link>
                    </TD>
                    <TD>{i.client}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{formatDay(i.dueDate, { short: true })}</span>
                        {late > 0 ? <Badge tone={late > 60 ? "bad" : "warn"}>{late}d late</Badge> : <Badge tone="good">on time</Badge>}
                      </div>
                    </TD>
                    <TD className="text-right font-bold tabular-nums">{formatINR(i.totalPaise - i.paidPaise, { whole: true })}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </section>
    </div>
  );
}
