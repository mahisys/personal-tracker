import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, Building2, CheckCircle2, Clock, FileText, Pencil, Receipt, Send, Trash2, Undo2, User, XCircle } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getQuoteDetail, openLeadOptions } from "@/server/sales/queries";
import { editorOptions } from "@/server/invoices/queries";
import { convertQuoteToInvoice, deleteQuote, saveQuote, setQuoteStatus } from "@/server/sales/actions";
import { displayQuoteStatus, QUOTE_STATUS_META } from "@/server/sales/status";
import { itemsToRows } from "@/server/invoices/lines";
import { PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { ActionButton } from "@/components/client/action-form";
import { Attachments } from "@/components/shared/attachments";
import { History } from "@/components/shared/history";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { DocumentForm } from "@/components/invoices/document-form";
import { QuotePreview } from "@/components/sales/quote-preview";
import { formatDay, relativeDay, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await getQuoteDetail(id) : null;
  return { title: d ? `Quote ${d.quote.number}` : "Quote" };
}

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getQuoteDetail(id);
  if (!d) notFound();
  const settings = await getSettings();
  const q = d.quote;
  const today = todayIST();
  const shown = displayQuoteStatus(q, today);
  const back = (
    <Link href="/sales/quotes" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" /> Quotes
    </Link>
  );

  if (q.status === "draft" && sp.edit === "1" && !q.invoiceId) {
    const [opts, leads] = await Promise.all([editorOptions(), openLeadOptions()]);
    return (
      <>
        {back}
        <PageHeader
          eyebrow="Editing draft"
          title={q.number}
          actions={
            <LinkButton href={`/sales/quotes/${q.id}`} variant="secondary">
              Cancel
            </LinkButton>
          }
        />
        <DocumentForm
          kind="quote"
          action={saveQuote}
          sellerStateCode={settings.business.stateCode}
          termDays={15}
          companies={opts.companies}
          contacts={opts.contacts}
          leads={leads}
          submitLabel="Save quote"
          initial={{
            id: q.id,
            workspace: q.workspace,
            leadId: q.leadId,
            companyId: q.companyId,
            contactId: q.contactId,
            issueDate: q.issueDate,
            endDate: q.validUntil,
            placeOfSupply: q.placeOfSupply,
            notes: q.notes,
            terms: q.terms,
            rows: itemsToRows(d.items),
          }}
        />
      </>
    );
  }

  const to = d.company
    ? { name: d.company.name, lines: [d.company.address, d.company.gstin ? `GSTIN: ${d.company.gstin}` : "", d.contact ? `Attn: ${d.contact.name}` : ""].filter(Boolean) as string[] }
    : { name: d.contact?.name ?? d.leadTitle ?? "Client", lines: [d.contact?.email ?? ""].filter(Boolean) };

  const status = (s: string, label: React.ReactNode, variant: "primary" | "secondary" | "success" | "danger" | "soft" = "secondary") => (
    <ActionButton key={s} action={setQuoteStatus} hidden={{ id: q.id, status: s }} variant={variant} size="md">
      {label}
    </ActionButton>
  );

  return (
    <>
      {back}
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Badge tone={QUOTE_STATUS_META[shown].tone} dot>
              {QUOTE_STATUS_META[shown].label}
            </Badge>
            <WorkspaceBadge ws={q.workspace} />
          </span>
        }
        title={<span className="tabular-nums">{q.number}</span>}
        description={`${to.name} · ${formatINR(q.totalPaise)}${q.validUntil ? ` · valid till ${formatDay(q.validUntil)}` : ""}`}
        actions={
          <>
            {q.invoiceId && d.invoice ? (
              <LinkButton href={`/invoices/${d.invoice.id}`}>
                <Receipt className="h-4 w-4" /> Invoice {d.invoice.number}
              </LinkButton>
            ) : null}
            {!q.invoiceId && q.status === "draft" ? (
              <>
                <LinkButton href={`/sales/quotes/${q.id}?edit=1`} variant="secondary">
                  <Pencil className="h-4 w-4" /> Edit
                </LinkButton>
                {status(
                  "sent",
                  <>
                    <Send className="h-4 w-4" /> Mark sent
                  </>,
                  "primary",
                )}
              </>
            ) : null}
            {!q.invoiceId && q.status === "sent" ? (
              <>
                {status(
                  "accepted",
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Accepted
                  </>,
                  "success",
                )}
                {status(
                  "rejected",
                  <>
                    <XCircle className="h-4 w-4" /> Rejected
                  </>,
                  "danger",
                )}
                {status(
                  "expired",
                  <>
                    <Clock className="h-4 w-4" /> Expired
                  </>,
                )}
              </>
            ) : null}
            {!q.invoiceId && q.status === "accepted" ? (
              <ActionButton action={convertQuoteToInvoice} hidden={{ id: q.id }} variant="primary" size="md">
                <FileText className="h-4 w-4" /> Convert to invoice
              </ActionButton>
            ) : null}
          </>
        }
      />

      {!q.invoiceId && q.status === "accepted" ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-800 animate-pop-in dark:text-emerald-200">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          Accepted — convert it to a draft invoice with the same line items whenever you&apos;re ready.
        </div>
      ) : null}
      {shown === "expired" && q.status === "sent" ? (
        <div className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          This quote passed its validity {relativeDay(q.validUntil!, today)}. A quick follow-up might revive it.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <QuotePreview quote={q} items={d.items} business={settings.business} to={to} />
        <div className="stagger space-y-6">
          <Card>
            <CardHeader title="Linked" />
            <CardBody className="space-y-1.5 text-sm">
              {q.leadId ? (
                <Linked href={`/crm/leads/${q.leadId}`} icon={<Briefcase className="h-4 w-4" />} label={d.leadTitle ?? "Lead"} />
              ) : (
                <p className="text-fg-subtle">Not linked to a lead.</p>
              )}
              {d.company ? <Linked href={`/crm/companies/${d.company.id}`} icon={<Building2 className="h-4 w-4" />} label={d.company.name} /> : null}
              {d.contact ? <Linked href={`/crm/contacts/${d.contact.id}`} icon={<User className="h-4 w-4" />} label={d.contact.name} /> : null}
            </CardBody>
          </Card>
          <Attachments entityType="quote" entityId={q.id} path={`/sales/quotes/${q.id}`} />
          <History entityType="quote" entityId={q.id} />
          {!q.invoiceId ? (
            <div className="flex flex-wrap gap-2">
              {q.status !== "draft" ? (
                <ActionButton action={setQuoteStatus} hidden={{ id: q.id, status: q.status === "sent" ? "draft" : "sent" }} variant="ghost">
                  <Undo2 className="h-3.5 w-3.5" /> {q.status === "sent" ? "Back to draft" : "Reopen as sent"}
                </ActionButton>
              ) : null}
              <ActionButton action={deleteQuote} hidden={{ id: q.id }} variant="danger" confirm="Delete this quote?">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </ActionButton>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Linked({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 font-semibold text-fg transition hover:bg-brand-soft hover:text-brand">
      <span className="text-fg-subtle">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
