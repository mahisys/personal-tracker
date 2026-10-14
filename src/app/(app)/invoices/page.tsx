import Link from "next/link";
import { AlarmClock, FileText, HandCoins, Plus, Timer, Wallet } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { invoiceStats, listInvoices } from "@/server/invoices/queries";
import { INVOICE_TABS, matchesTab, type InvoiceTab } from "@/server/invoices/status";
import { EmptyState, PageHeader, SubNav } from "@/components/ui/page";
import { StatTile } from "@/components/ui/stat";
import { LinkButton } from "@/components/ui/button";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-bits";
import { formatDay, relativeDay, todayIST } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata = { title: "Invoices" };

const TAB_LABEL: Record<InvoiceTab, string> = { all: "All", draft: "Draft", unpaid: "Unpaid", overdue: "Overdue", paid: "Paid" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const tab: InvoiceTab = INVOICE_TABS.includes(sp.tab as InvoiceTab) ? (sp.tab as InvoiceTab) : "all";
  const ws = await getWorkspaceFilter();
  const rows = await listInvoices(ws);
  const stats = await invoiceStats(ws, rows);
  const shown = rows.filter((r) => matchesTab(r.derived, tab));
  const today = todayIST();

  return (
    <>
      <PageHeader
        eyebrow="MahiSys"
        title="Invoices"
        description="GST invoices, payments and gentle reminders — all in one place."
        actions={
          <LinkButton href="/invoices/new">
            <Plus className="h-4 w-4" /> New invoice
          </LinkButton>
        }
      />

      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Outstanding" value={formatINRShort(stats.outstanding)} sub={`${stats.unpaidCount} unpaid`} icon={<Wallet className="h-5 w-5" />} tone="brand" href="/invoices?tab=unpaid" />
        <StatTile
          label="Overdue"
          value={formatINRShort(stats.overdue)}
          sub={stats.overdueCount ? `${stats.overdueCount} need a nudge` : "Nothing overdue 🎉"}
          icon={<AlarmClock className="h-5 w-5" />}
          tone={stats.overdueCount ? "bad" : "good"}
          href="/invoices?tab=overdue"
        />
        <StatTile label="Collected this month" value={formatINRShort(stats.collected)} icon={<HandCoins className="h-5 w-5" />} tone="good" />
        <StatTile label="Avg. days to pay" value={stats.avgDaysToPay == null ? "—" : `${stats.avgDaysToPay}d`} sub="Issue → fully paid" icon={<Timer className="h-5 w-5" />} tone="info" />
      </div>

      <SubNav
        active={`/invoices?tab=${tab}`}
        items={INVOICE_TABS.map((t) => ({ href: `/invoices?tab=${t}`, label: TAB_LABEL[t], count: rows.filter((r) => matchesTab(r.derived, t)).length }))}
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title={tab === "all" ? "No invoices yet — raise your first one" : tab === "overdue" ? "Nothing overdue — lovely" : `No ${TAB_LABEL[tab].toLowerCase()} invoices`}
          description={tab === "all" ? "Create a GST invoice in under a minute. Totals, CGST/SGST or IGST are worked out for you." : "Everything here is up to date."}
          action={
            tab === "all" ? (
              <LinkButton href="/invoices/new">
                <Plus className="h-4 w-4" /> New invoice
              </LinkButton>
            ) : null
          }
        />
      ) : (
        <>
          {/* Phones: cards */}
          <div className="stagger space-y-3 md:hidden">
            {shown.map((r) => (
              <Link key={r.id} href={`/invoices/${r.id}`} className="glass block rounded-2xl border border-line p-4 shadow-card transition active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-fg">{r.billTo.name}</div>
                    <div className="text-xs text-fg-subtle tabular-nums">{r.number}</div>
                  </div>
                  <InvoiceStatusBadge status={r.derived} />
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div className="text-xs text-fg-muted">
                    Due {formatDay(r.dueDate, { short: true })}
                    {r.balancePaise > 0 && r.derived !== "draft" && r.derived !== "cancelled" ? (
                      <span className={cn("ml-1 font-semibold", r.derived === "overdue" ? "text-rose-600 dark:text-rose-300" : "")}>· {relativeDay(r.dueDate, today)}</span>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold tabular-nums text-fg">{formatINR(r.totalPaise)}</div>
                    {r.paidPaise > 0 && r.balancePaise > 0 ? <div className="text-[11px] text-fg-subtle tabular-nums">{formatINR(r.balancePaise)} left</div> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <TableWrap className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Invoice</TH>
                  <TH>Client</TH>
                  <TH>Issued</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Balance</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody className="stagger">
                {shown.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/invoices/${r.id}`} className="font-bold tabular-nums text-fg hover:text-brand">
                        {r.number}
                      </Link>
                      {!ws ? <WorkspaceBadge ws={r.workspace} className="ml-2" /> : null}
                    </TD>
                    <TD className="max-w-[240px] truncate">{r.billTo.name}</TD>
                    <TD className="text-fg-muted">{formatDay(r.issueDate, { short: true })}</TD>
                    <TD className={cn(r.derived === "overdue" ? "font-semibold text-rose-600 dark:text-rose-300" : "text-fg-muted")}>
                      {formatDay(r.dueDate, { short: true })}
                      {r.derived === "overdue" ? <span className="block text-[11px]">{relativeDay(r.dueDate, today)}</span> : null}
                    </TD>
                    <TD className="text-right font-semibold tabular-nums">{formatINR(r.totalPaise)}</TD>
                    <TD className="text-right tabular-nums text-fg-muted">{r.derived === "cancelled" || r.derived === "draft" ? "—" : formatINR(r.balancePaise)}</TD>
                    <TD>
                      <InvoiceStatusBadge status={r.derived} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </>
      )}
    </>
  );
}
