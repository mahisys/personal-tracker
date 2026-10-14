import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, BellRing, Briefcase, Building2, Download, ExternalLink, FileCheck2, FolderKanban, Pencil, Receipt, Send, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { editorOptions, getInvoiceDetail, paymentAccounts } from "@/server/invoices/queries";
import { cancelInvoice, deleteDraftInvoice, markInvoiceSent, saveInvoice } from "@/server/invoices/actions";
import { itemsToRows } from "@/server/invoices/lines";
import { buildPaymentReminder, whatsappLink } from "@/server/invoices/reminder";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { Progress } from "@/components/ui/stat";
import { ActionButton } from "@/components/client/action-form";
import { Attachments } from "@/components/shared/attachments";
import { History } from "@/components/shared/history";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { DocumentForm } from "@/components/invoices/document-form";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-bits";
import { PaymentModal } from "@/components/invoices/payment-modal";
import { ReminderButton } from "@/components/invoices/reminder-button";
import { formatDay, relativeDay, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await getInvoiceDetail(id) : null;
  return { title: d ? `Invoice ${d.invoice.number}` : "Invoice" };
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; pay?: string }> }) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getInvoiceDetail(id);
  if (!d) notFound();
  const settings = await getSettings();
  const { invoice: inv, derived, balancePaise } = d;
  const today = todayIST();
  const isDraft = inv.status === "draft";
  const editing = isDraft && sp.edit === "1";
  const canPay = inv.status !== "cancelled" && balancePaise > 0;
  const paidPct = inv.totalPaise > 0 ? Math.round((inv.paidPaise / inv.totalPaise) * 100) : 0;

  const back = (
    <Link href="/invoices" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" /> Invoices
    </Link>
  );

  if (editing) {
    const opts = await editorOptions();
    return (
      <>
        {back}
        <PageHeader
          eyebrow="Editing draft"
          title={inv.number}
          description="Changes are saved to the draft. The number stays the same."
          actions={
            <LinkButton href={`/invoices/${inv.id}`} variant="secondary">
              Cancel
            </LinkButton>
          }
        />
        <DocumentForm
          kind="invoice"
          action={saveInvoice}
          sellerStateCode={settings.business.stateCode}
          termDays={settings.business.defaultPaymentTermsDays}
          companies={opts.companies}
          contacts={opts.contacts}
          projects={opts.projects}
          submitLabel="Save invoice"
          initial={{
            id: inv.id,
            workspace: inv.workspace,
            companyId: inv.companyId,
            contactId: inv.contactId,
            projectId: inv.projectId,
            billTo: inv.billTo,
            issueDate: inv.issueDate,
            endDate: inv.dueDate,
            placeOfSupply: inv.placeOfSupply,
            notes: inv.notes,
            terms: inv.terms,
            rows: itemsToRows(d.items),
          }}
        />
      </>
    );
  }

  const accounts = canPay ? await paymentAccounts() : [];
  const phone = d.reminderContact?.whatsapp || d.reminderContact?.phone || null;
  const reminder = buildPaymentReminder({
    clientName: inv.billTo.name,
    contactName: d.reminderContact?.name,
    number: inv.number,
    balancePaise,
    dueDate: inv.dueDate,
    today,
    businessName: settings.business.legalName || settings.business.name,
    upiId: settings.business.upiId,
  });
  const showReminder = canPay && (derived === "sent" || derived === "part_paid" || derived === "overdue");
  const stamp = derived === "paid" ? { label: "Paid", tone: "good" as const } : derived === "cancelled" ? { label: "Cancelled", tone: "neutral" as const } : derived === "overdue" ? { label: "Overdue", tone: "bad" as const } : null;

  return (
    <>
      {back}
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <InvoiceStatusBadge status={derived} />
            <WorkspaceBadge ws={inv.workspace} />
          </span>
        }
        title={<span className="tabular-nums">{inv.number}</span>}
        description={
          <>
            {inv.billTo.name} · {formatINR(inv.totalPaise)} · due {formatDay(inv.dueDate)}
            {derived === "overdue" ? <span className="font-semibold text-rose-600 dark:text-rose-300"> ({relativeDay(inv.dueDate, today)})</span> : null}
          </>
        }
        actions={
          <>
            <a href={`/api/invoices/${inv.id}/pdf?download=1`} className={buttonClass("secondary")}>
              <Download className="h-4 w-4" /> Download PDF
            </a>
            {isDraft ? (
              <>
                <LinkButton href={`/invoices/${inv.id}?edit=1`} variant="secondary">
                  <Pencil className="h-4 w-4" /> Edit
                </LinkButton>
                <ActionButton action={markInvoiceSent} hidden={{ id: inv.id }} variant="primary" size="md">
                  <Send className="h-4 w-4" /> Mark sent
                </ActionButton>
              </>
            ) : null}
            {canPay && !isDraft ? <PaymentModal invoiceId={inv.id} number={inv.number} balancePaise={balancePaise} accounts={accounts} defaultOpen={sp.pay === "1"} /> : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <InvoicePreview invoice={inv} items={d.items} business={settings.business} stamp={stamp} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
            <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold hover:text-brand">
              <ExternalLink className="h-3.5 w-3.5" /> Open PDF in a new tab
            </a>
            {inv.sentAt ? <span>· Sent {formatDay(inv.sentAt.toISOString().slice(0, 10), { short: true })}</span> : null}
          </div>
        </div>

        <div className="stagger space-y-6">
          <Card>
            <CardBody>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs font-semibold text-fg-muted">{balancePaise > 0 ? "Balance due" : "Settled"}</div>
                  <div className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums text-fg">{formatINR(balancePaise)}</div>
                </div>
                <div className="text-right text-xs text-fg-muted">
                  <div className="font-bold tabular-nums text-fg">{paidPct}%</div>
                  collected
                </div>
              </div>
              <Progress value={paidPct} tone={paidPct >= 100 ? "good" : derived === "overdue" ? "bad" : "brand"} className="mt-4" />
              <div className="mt-2 flex justify-between text-[11px] text-fg-subtle tabular-nums">
                <span>{formatINR(inv.paidPaise)} received</span>
                <span>of {formatINR(inv.totalPaise)}</span>
              </div>
              {isDraft ? (
                <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-xs text-fg-muted">This is a draft. Mark it sent when it&apos;s gone to the client — then you can record payments.</p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payments" icon={<Receipt className="h-4.5 w-4.5" />} description={d.payments.length ? `${d.payments.length} recorded` : "None yet"} />
            <CardBody className="space-y-3">
              {d.payments.length === 0 ? (
                <p className="text-sm text-fg-subtle">{canPay ? "When the client pays, record it here — it goes straight into your books." : "No payments on this invoice."}</p>
              ) : (
                <ol className="space-y-2">
                  {d.payments.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-solid/50 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-300">+ {formatINR(p.amountPaise)}</div>
                        <div className="truncate text-[11px] text-fg-subtle">
                          {formatDay(p.date, { short: true })} · {[p.mode, p.accountName, p.reference].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {p.tdsPaise > 0 ? <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">TDS {formatINR(p.tdsPaise)}</span> : null}
                    </li>
                  ))}
                </ol>
              )}
              {canPay && isDraft ? <PaymentModal invoiceId={inv.id} number={inv.number} balancePaise={balancePaise} accounts={accounts} size="sm" /> : null}
            </CardBody>
          </Card>

          {showReminder ? (
            <Card>
              <CardHeader title="Payment reminder" icon={<BellRing className="h-4.5 w-4.5" />} description={derived === "overdue" ? "A friendly nudge usually does it" : "Ready when you need it"} />
              <CardBody>
                <ReminderButton text={reminder} waLink={whatsappLink(phone, reminder)} email={inv.billTo.email || d.reminderContact?.email || null} subject={`Payment reminder — invoice ${inv.number}`} />
              </CardBody>
            </Card>
          ) : null}

          {d.company || d.project || d.quote || inv.leadId ? (
            <Card>
              <CardHeader title="Linked" icon={<FileCheck2 className="h-4.5 w-4.5" />} />
              <CardBody className="space-y-1.5 text-sm">
                {d.company ? <LinkedRow href={`/crm/companies/${d.company.id}`} icon={<Building2 className="h-4 w-4" />} label={d.company.name} /> : null}
                {d.project ? <LinkedRow href={`/projects/${d.project.id}`} icon={<FolderKanban className="h-4 w-4" />} label={d.project.name} /> : null}
                {d.quote ? <LinkedRow href={`/sales/quotes/${d.quote.id}`} icon={<FileCheck2 className="h-4 w-4" />} label={`Quote ${d.quote.number}`} /> : null}
                {inv.leadId ? <LinkedRow href={`/crm/leads/${inv.leadId}`} icon={<Briefcase className="h-4 w-4" />} label="Lead" /> : null}
              </CardBody>
            </Card>
          ) : null}

          <Attachments entityType="invoice" entityId={inv.id} path={`/invoices/${inv.id}`} />
          <History entityType="invoice" entityId={inv.id} />

          <div className="flex flex-wrap gap-2">
            {inv.status !== "cancelled" && inv.paidPaise === 0 && !isDraft ? (
              <ActionButton action={cancelInvoice} hidden={{ id: inv.id }} variant="danger" confirm="Cancel this invoice? It stays on record with a zero balance.">
                <Ban className="h-3.5 w-3.5" /> Cancel invoice
              </ActionButton>
            ) : null}
            {isDraft ? (
              <ActionButton action={deleteDraftInvoice} hidden={{ id: inv.id }} variant="danger" confirm="Delete this draft for good?">
                <Trash2 className="h-3.5 w-3.5" /> Delete draft
              </ActionButton>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function LinkedRow({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 font-semibold text-fg transition hover:bg-brand-soft hover:text-brand">
      <span className="text-fg-subtle">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
