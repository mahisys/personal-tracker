import Link from "next/link";
import type { Metadata } from "next";
import { BadgeIndianRupee, Clock3, FileCheck2, HandCoins, Landmark, PartyPopper, Receipt, ShieldCheck, TrendingUp } from "lucide-react";
import type { PayoutStatus } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { AnimatedNumber } from "@/components/client/animated-number";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Section } from "@/components/ui/page";
import { Progress, StatTile } from "@/components/ui/stat";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { DsaNav } from "@/components/dsa/nav";
import { ProductTag } from "@/components/dsa/chips";
import { EarningsChart } from "@/components/dsa/charts";
import { EditPayoutButton, InvoiceButton, PartnerPaidButton, ReceiveButton } from "@/components/dsa/payout-forms";
import { cn } from "@/lib/cn";
import { financialYear, formatDay, relativeDay, todayIST } from "@/lib/dates";
import { bpsToPercent, formatINR, formatINRShort } from "@/lib/money";
import { PRODUCT_LABELS } from "@/server/dsa/constants";
import { monthlyEarnings, netOf, sumBy, totals } from "@/server/dsa/logic";
import { accountOptions, earningsRows, listPayouts, type PayoutRow } from "@/server/dsa/queries";
import type { LoanProduct } from "@/db/schema";

export const metadata: Metadata = { title: "DSA payouts" };

const TABS = [
  { key: "expected", label: "Expected", icon: Clock3 },
  { key: "invoiced", label: "Invoiced", icon: FileCheck2 },
  { key: "received", label: "Received", icon: BadgeIndianRupee },
  { key: "earnings", label: "Earnings", icon: TrendingUp },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "expected") as Tab;
  const today = todayIST();
  const [all, accounts] = await Promise.all([listPayouts(), accountOptions()]);
  const by = (s: PayoutStatus) => all.filter((r) => r.payout.status === s);
  const counts = { expected: by("expected").length, invoiced: by("invoiced").length, received: by("received").length };
  const unpaidPartners = all.filter((r) => r.payout.subConnectorId && r.payout.subConnectorSharePaise > 0 && !r.payout.subConnectorPaidDate);

  return (
    <>
      <PageHeader eyebrow="Loan DSA" title="Payouts & earnings" description="What lenders owe you, what's invoiced, and what's landed — with TDS tracked for tax time." />
      <DsaNav active="/dsa/payouts" />

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-muted p-1 sm:inline-flex">
        {TABS.map((t) => {
          const Icon = t.icon;
          const n = t.key === "earnings" ? null : counts[t.key];
          return (
            <Link
              key={t.key}
              href={`/dsa/payouts?tab=${t.key}`}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
                tab === t.key ? "bg-solid text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
              {n != null ? <span className="rounded-full bg-bg/60 px-1.5 text-[11px] tabular-nums">{n}</span> : null}
            </Link>
          );
        })}
      </div>

      {tab === "earnings" ? (
        <Earnings today={today} />
      ) : (
        <>
          <PayoutTable rows={by(tab)} status={tab} accounts={accounts} today={today} />
          {unpaidPartners.length ? (
            <Section title="Partner shares to pay" className="mt-8">
              <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {unpaidPartners.map((r) => (
                  <Card key={r.payout.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-fg">{r.partnerName}</div>
                        <Link href={`/dsa/files/${r.fileId}`} className="text-xs text-fg-muted hover:text-amber-600">
                          for {r.borrowerName}
                        </Link>
                      </div>
                      <div className="text-right text-lg font-extrabold tabular-nums text-fg">{formatINR(r.payout.subConnectorSharePaise, { whole: true })}</div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge tone={r.payout.status === "received" ? "warn" : "neutral"}>{r.payout.status === "received" ? "Lender paid — your turn" : `Lender ${r.payout.status}`}</Badge>
                      <PartnerPaidButton payout={r.payout} partnerName={r.partnerName ?? "partner"} accounts={accounts} today={today} />
                    </div>
                  </Card>
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </>
  );
}

function PayoutTable({ rows, status, accounts, today }: { rows: PayoutRow[]; status: PayoutStatus; accounts: { id: string; name: string }[]; today: string }) {
  const t = totals(rows.map((r) => r.payout));
  const received = rows.reduce((s, r) => s + (r.payout.netReceivedPaise ?? 0), 0);
  if (rows.length === 0) {
    const copy = {
      expected: { title: "No payouts expected", desc: "Disburse a file and its payout shows up here automatically.", icon: <Clock3 className="h-6 w-6" /> },
      invoiced: { title: "Nothing invoiced right now", desc: "Raise invoices for expected payouts to get paid faster.", icon: <FileCheck2 className="h-6 w-6" /> },
      received: { title: "No payouts received yet", desc: "Your first commission will feel great — it's coming.", icon: <PartyPopper className="h-6 w-6" /> },
    }[status];
    return <EmptyState icon={copy.icon} title={copy.title} description={copy.desc} />;
  }
  return (
    <>
      <div className="stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Gross" value={<AnimatedNumber value={t.gross} format="inr-short" />} sub={`${rows.length} payout${rows.length === 1 ? "" : "s"}`} tone="warn" icon={<Receipt className="h-5 w-5" />} />
        <StatTile label="+ GST" value={<AnimatedNumber value={t.gst} format="inr-short" />} tone="info" />
        <StatTile label="− TDS" value={<AnimatedNumber value={t.tds} format="inr-short" />} sub="194H credit" tone="violet" />
        <StatTile label={status === "received" ? "Net received" : "Net due"} value={<AnimatedNumber value={status === "received" ? received : t.net} format="inr-short" />} tone="good" icon={<BadgeIndianRupee className="h-5 w-5" />} />
      </div>
      <TableWrap className="animate-fade-up">
        <Table className="min-w-[880px]">
          <THead>
            <tr>
              <TH>Borrower</TH>
              <TH>Lender</TH>
              <TH className="text-right">Disbursed</TH>
              <TH className="text-right">Rate</TH>
              <TH className="text-right">Gross</TH>
              <TH className="text-right">GST</TH>
              <TH className="text-right">TDS</TH>
              <TH className="text-right">Net</TH>
              <TH>{status === "expected" ? "Expected" : status === "invoiced" ? "Invoice" : "Received"}</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => {
              const p = r.payout;
              const late = status !== "received" && p.expectedDate && p.expectedDate < today;
              return (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/dsa/files/${r.fileId}`} className="font-semibold hover:text-amber-600 dark:hover:text-amber-300">
                      {r.borrowerName}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <ProductTag product={r.product} short />
                      {r.partnerName ? <span className="text-[11px] text-fg-subtle">via {r.partnerName}</span> : null}
                    </div>
                  </TD>
                  <TD className="text-fg-muted">{r.lenderName ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{formatINRShort(r.disbursedPaise)}</TD>
                  <TD className="text-right tabular-nums">{r.payoutRateBps ? `${bpsToPercent(r.payoutRateBps)}%` : <Badge tone="warn">set rate</Badge>}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatINR(p.grossPaise, { whole: true })}</TD>
                  <TD className="text-right tabular-nums text-fg-muted">{formatINR(p.gstPaise, { whole: true })}</TD>
                  <TD className="text-right tabular-nums text-fg-muted">{formatINR(p.tdsPaise, { whole: true })}</TD>
                  <TD className="text-right font-bold tabular-nums">{formatINR(p.netReceivedPaise ?? netOf(p), { whole: true })}</TD>
                  <TD className="whitespace-nowrap text-xs">
                    {status === "expected" ? (
                      <span className={cn(late ? "font-semibold text-rose-600 dark:text-rose-300" : "text-fg-muted")}>{p.expectedDate ? relativeDay(p.expectedDate, today) : "—"}</span>
                    ) : status === "invoiced" ? (
                      <span className="text-fg-muted">
                        {p.invoiceNo}
                        <br />
                        {formatDay(p.invoiceDate, { short: true })}
                        {late ? <span className="block font-semibold text-rose-600 dark:text-rose-300">overdue</span> : null}
                      </span>
                    ) : (
                      <span className="text-fg-muted">{formatDay(p.receivedDate, { short: true })}</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1.5">
                      {status === "expected" ? <InvoiceButton payout={p} today={today} /> : null}
                      {status !== "received" ? <ReceiveButton payout={p} accounts={accounts} today={today} /> : null}
                      {status !== "received" ? <EditPayoutButton payout={p} /> : null}
                      {status === "received" ? <ShieldCheck className="h-4 w-4 text-emerald-500" aria-label="In the books" /> : null}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}

async function Earnings({ today }: { today: string }) {
  const rows = await earningsRows();
  const fy = financialYear(today);
  const months = monthlyEarnings(rows, today, 12);
  const inFy = rows.filter((r) => r.disbursalDate && r.disbursalDate >= fy.start && r.disbursalDate <= fy.end);
  const t = totals(inFy);
  const receivedFy = rows.filter((r) => r.receivedDate && r.receivedDate >= fy.start && r.receivedDate <= fy.end);
  const tdsCredit = receivedFy.reduce((s, r) => s + r.tdsPaise, 0);
  const netIn = receivedFy.reduce((s, r) => s + (r.netReceivedPaise ?? 0), 0);
  const byLender = sumBy(inFy, (r) => r.lenderName ?? "Unknown lender", (r) => r.grossPaise).filter((x) => x.value > 0);
  const byProduct = sumBy(inFy, (r) => r.product, (r) => r.grossPaise).filter((x) => x.value > 0);

  if (rows.length === 0) {
    return <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="Earnings will chart here" description="Once files are disbursed, you'll see month-by-month commission, best lenders and products." />;
  }

  return (
    <div className="space-y-6">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Gross · ${fy.label}`} value={<AnimatedNumber value={t.gross} format="inr-short" />} sub={`${inFy.length} disbursals`} tone="warn" icon={<TrendingUp className="h-5 w-5" />} />
        <StatTile label="In hand" value={<AnimatedNumber value={t.inHand} format="inr-short" />} sub="After TDS & partner shares" tone="good" icon={<HandCoins className="h-5 w-5" />} />
        <StatTile label="Received in bank" value={<AnimatedNumber value={netIn} format="inr-short" />} sub="Net, this FY" tone="info" icon={<BadgeIndianRupee className="h-5 w-5" />} />
        <StatTile label="TDS credit" value={<AnimatedNumber value={tdsCredit} format="inr-short" />} sub="Match with Form 26AS / AIS" tone="violet" icon={<ShieldCheck className="h-5 w-5" />} />
      </div>

      <Card className="animate-fade-up">
        <CardHeader title="Monthly earnings" description="Last 12 months, by disbursal month" icon={<TrendingUp className="h-4.5 w-4.5" />} />
        <CardBody>
          <EarningsChart data={months} />
        </CardBody>
      </Card>

      <div className="stagger grid gap-4 lg:grid-cols-2">
        <BarList title="By lender" icon={<Landmark className="h-4.5 w-4.5" />} items={byLender.map((x) => ({ label: x.key, value: x.value }))} />
        <BarList title="By product" icon={<Receipt className="h-4.5 w-4.5" />} items={byProduct.map((x) => ({ label: PRODUCT_LABELS[x.key as LoanProduct] ?? x.key, value: x.value }))} />
      </div>

      <Card className="animate-fade-up">
        <CardHeader title={`${fy.label} summary`} description="Handy for your CA at ITR time" icon={<ShieldCheck className="h-4.5 w-4.5" />} />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Gross commission", t.gross],
              ["GST charged", t.gst],
              ["TDS deducted", t.tds],
              ["Partner shares", t.sub],
              ["Net receivable", t.net],
              ["TDS credit (received)", tdsCredit],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs text-fg-muted">{k}</dt>
                <dd className="mt-0.5 text-lg font-extrabold tabular-nums text-fg">{formatINR(v as number, { whole: true })}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-fg-subtle">
            Gross is by disbursal date in {fy.label}; TDS credit counts payouts received in the year. Commission income is taxable on accrual — confirm figures with your 26AS.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function BarList({ title, icon, items }: { title: string; icon: React.ReactNode; items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <Card>
      <CardHeader title={title} icon={icon} description="Gross commission this FY" />
      <CardBody>
        {items.length === 0 ? (
          <p className="text-sm text-fg-subtle">Nothing yet this year.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.label}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-semibold text-fg">{i.label}</span>
                  <span className="shrink-0 tabular-nums text-fg-muted">
                    <b className="text-fg">{formatINRShort(i.value)}</b> · {Math.round((i.value / total) * 100)}%
                  </span>
                </div>
                <Progress value={(i.value / max) * 100} tone="warn" />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
