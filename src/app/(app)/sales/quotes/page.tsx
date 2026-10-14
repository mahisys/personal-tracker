import Link from "next/link";
import { FileSignature, Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getWorkspaceFilter } from "@/server/workspace";
import { listQuotes, openLeadOptions } from "@/server/sales/queries";
import { editorOptions } from "@/server/invoices/queries";
import { saveQuote } from "@/server/sales/actions";
import { displayQuoteStatus, QUOTE_STATUS_META } from "@/server/sales/status";
import { emptyRow } from "@/server/invoices/lines";
import { EmptyState, PageHeader, SubNav } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/client/modal";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { DocumentForm } from "@/components/invoices/document-form";
import { addDays, formatDay, todayIST } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";

export const metadata = { title: "Quotes" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ new?: string; lead?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const filter = await getWorkspaceFilter();
  const [rows, settings, opts, leads] = await Promise.all([listQuotes(filter), getSettings(), editorOptions(), openLeadOptions()]);
  const today = todayIST();
  const lead = sp.lead ? leads.find((l) => l.id === sp.lead) : undefined;
  const company = lead?.companyId ? opts.companies.find((c) => c.id === lead.companyId) : undefined;
  const b = settings.business;

  const pipelineValue = rows.filter((r) => displayQuoteStatus(r.quote, today) === "sent").reduce((s, r) => s + r.quote.totalPaise, 0);
  const acceptedValue = rows.filter((r) => r.quote.status === "accepted").reduce((s, r) => s + r.quote.totalPaise, 0);

  const newModal = (open: boolean) => (
    <Modal
      trigger={
        <>
          <Plus className="h-4 w-4" /> New quote
        </>
      }
      title="New quote"
      description="Line items, GST and totals — exactly as the client will see them."
      wide
      defaultOpen={open}
    >
      <DocumentForm
        kind="quote"
        action={saveQuote}
        sellerStateCode={b.stateCode}
        termDays={15}
        companies={opts.companies}
        contacts={opts.contacts}
        leads={leads}
        submitLabel="Create quote"
        stacked
        initial={{
          workspace: lead ? (company?.workspace ?? "mahisys") : filter && filter !== "personal" ? filter : "mahisys",
          leadId: lead?.id ?? null,
          companyId: lead?.companyId ?? null,
          contactId: lead?.contactId ?? null,
          placeOfSupply: company?.stateCode ?? b.stateCode ?? "",
          issueDate: today,
          endDate: addDays(today, 15),
          terms: "Prices are exclusive of GST unless stated. Valid for 15 days.",
          rows: [emptyRow()],
        }}
      />
    </Modal>
  );

  return (
    <>
      <PageHeader eyebrow="Sales" title="Quotes" description="Proposals with GST worked out — accept one and it turns into an invoice in a tap." actions={newModal(sp.new === "1")} />
      <SubNav active="/sales/quotes" items={[{ href: "/sales", label: "Dashboard" }, { href: "/sales/quotes", label: "Quotes", count: rows.length }]} />

      {rows.length ? (
        <div className="mb-5 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-sky-500/10 px-3 py-1 font-semibold text-sky-700 dark:text-sky-300">Awaiting reply · {formatINRShort(pipelineValue)}</span>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-700 dark:text-emerald-300">Accepted, not invoiced · {formatINRShort(acceptedValue)}</span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={<FileSignature className="h-6 w-6" />} title="No quotes yet — send your first proposal" description="Quotes are numbered per financial year and convert to invoices with one tap." action={newModal(false)} />
      ) : (
        <>
          <div className="stagger space-y-3 md:hidden">
            {rows.map(({ quote: q, companyName, contactName, leadTitle }) => {
              const s = displayQuoteStatus(q, today);
              return (
                <Link key={q.id} href={`/sales/quotes/${q.id}`} className="glass block rounded-2xl border border-line p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-fg">{companyName ?? contactName ?? leadTitle ?? "—"}</div>
                      <div className="text-xs tabular-nums text-fg-subtle">{q.number}</div>
                    </div>
                    <Badge tone={QUOTE_STATUS_META[s].tone}>{QUOTE_STATUS_META[s].label}</Badge>
                  </div>
                  <div className="mt-2 flex items-end justify-between text-xs text-fg-muted">
                    <span>{q.validUntil ? `Valid till ${formatDay(q.validUntil, { short: true })}` : formatDay(q.issueDate, { short: true })}</span>
                    <span className="text-base font-extrabold tabular-nums text-fg">{formatINR(q.totalPaise)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
          <TableWrap className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Quote</TH>
                  <TH>For</TH>
                  <TH>Date</TH>
                  <TH>Valid until</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody className="stagger">
                {rows.map(({ quote: q, companyName, contactName, leadTitle }) => {
                  const s = displayQuoteStatus(q, today);
                  return (
                    <TR key={q.id}>
                      <TD>
                        <Link href={`/sales/quotes/${q.id}`} className="font-bold tabular-nums text-fg hover:text-brand">
                          {q.number}
                        </Link>
                        {!filter ? <WorkspaceBadge ws={q.workspace} className="ml-2" /> : null}
                      </TD>
                      <TD>
                        <div className="max-w-[240px] truncate font-medium">{companyName ?? contactName ?? "—"}</div>
                        {leadTitle ? <div className="max-w-[240px] truncate text-xs text-fg-subtle">{leadTitle}</div> : null}
                      </TD>
                      <TD className="text-fg-muted">{formatDay(q.issueDate, { short: true })}</TD>
                      <TD className="text-fg-muted">{formatDay(q.validUntil, { short: true })}</TD>
                      <TD className="text-right font-semibold tabular-nums">{formatINR(q.totalPaise)}</TD>
                      <TD>
                        <Badge tone={QUOTE_STATUS_META[s].tone}>{QUOTE_STATUS_META[s].label}</Badge>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        </>
      )}
    </>
  );
}
