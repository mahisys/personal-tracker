import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Circle,
  FileText,
  FileSignature,
  ListTodo,
  MessagesSquare,
  Pencil,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { requireUser } from "@/server/auth";
import { getLeadDetail, lookupOptions } from "@/server/crm/queries";
import { addLeadTask, deleteLead, setLeadFollowUp } from "@/server/crm/actions";
import { followUpState, FOLLOW_UP_CLASS, daysSince } from "@/server/crm/pipeline";
import { displayQuoteStatus, QUOTE_STATUS_META } from "@/server/sales/status";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal } from "@/components/client/modal";
import { Attachments } from "@/components/shared/attachments";
import { History } from "@/components/shared/history";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { LeadForm } from "@/components/crm/lead-form";
import { StageStepper } from "@/components/crm/stage-stepper";
import { ActivityComposer } from "@/components/crm/activity-composer";
import { ActivityTimeline, ContactButtons, StageBadge } from "@/components/crm/bits";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-bits";
import { formatDateTime, formatDay, relativeDay, toDateTimeLocalIST, toISTDate, todayIST } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await getLeadDetail(id) : null;
  return { title: d?.lead.title ?? "Lead" };
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getLeadDetail(id);
  if (!d) notFound();
  const { lead, stage, contact, company } = d;
  const today = todayIST();
  const closed = stage.kind !== "open";
  const fu = followUpState(lead.nextFollowUpAt, today);
  const options = await lookupOptions(lead.workspace);
  const since = daysSince(lead.lastActivityAt, today);
  const weighted = Math.round((lead.valuePaise * lead.probability) / 100);

  return (
    <>
      <Link href="/crm" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Pipeline
      </Link>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <StageBadge name={stage.name} kind={stage.kind} />
            <WorkspaceBadge ws={lead.workspace} />
          </span>
        }
        title={lead.title}
        description={[company?.name, contact?.name].filter(Boolean).join(" · ") || "No contact linked yet"}
        actions={
          <>
            <Modal
              trigger={
                <>
                  <Pencil className="h-4 w-4" /> Edit
                </>
              }
              variant="secondary"
              title="Edit lead"
              wide
            >
              <LeadForm lead={lead} companyName={company?.name} contactName={contact?.name} workspace={lead.workspace} options={options} />
            </Modal>
            <LinkButton href={`/sales/quotes?new=1&lead=${lead.id}`} variant="soft">
              <FileSignature className="h-4 w-4" /> New quote
            </LinkButton>
          </>
        }
      />

      <div className="mb-6 animate-fade-up">
        <StageStepper leadId={lead.id} leadTitle={lead.title} currentId={lead.stageId} stages={d.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, probability: s.probability }))} />
        {stage.kind === "lost" && lead.lostReason ? (
          <p className="mt-2 rounded-xl bg-rose-500/8 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            <span className="font-bold">Lost:</span> {lead.lostReason}
          </p>
        ) : null}
      </div>

      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Deal value" value={lead.valuePaise ? formatINR(lead.valuePaise, { whole: true }) : "—"} sub={lead.valuePaise ? `${formatINRShort(weighted)} weighted` : "Add a value to forecast"} />
        <Metric label="Probability" value={`${lead.probability}%`} sub={stage.name} />
        <Metric label="Expected close" value={lead.expectedCloseDate ? formatDay(lead.expectedCloseDate, { short: true }) : "—"} sub={lead.expectedCloseDate ? relativeDay(lead.expectedCloseDate, today) : "Not set"} />
        <Metric label="Source" value={lead.source ?? "—"} sub={since == null ? "No activity yet" : since === 0 ? "Last touch today" : `Last touch ${since}d ago`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Log an interaction" icon={<MessagesSquare className="h-4.5 w-4.5" />} description={closed ? "This lead is closed — notes are still welcome" : "Every touch, with the next follow-up locked in"} />
            <CardBody>
              <ActivityComposer leadId={lead.id} closed={closed} today={today} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Timeline" icon={<CalendarClock className="h-4.5 w-4.5" />} description={`${d.activities.length} interaction${d.activities.length === 1 ? "" : "s"}`} />
            <CardBody>
              <ActivityTimeline items={d.activities} />
            </CardBody>
          </Card>
          {lead.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <CardBody className="whitespace-pre-line text-sm text-fg-muted">{lead.notes}</CardBody>
            </Card>
          ) : null}
        </div>

        <div className="stagger space-y-6">
          {!closed ? (
            <Card className={cn(fu === "overdue" && "border-rose-500/30", fu === "today" && "border-amber-500/30")}>
              <CardBody>
                <div className="text-xs font-semibold text-fg-muted">Next follow-up</div>
                {lead.nextFollowUpAt ? (
                  <>
                    <div className={cn("mt-1 text-2xl font-extrabold tracking-tight", FOLLOW_UP_CLASS[fu] === "text-fg-muted" ? "text-fg" : FOLLOW_UP_CLASS[fu])}>
                      {relativeDay(toISTDate(lead.nextFollowUpAt), today)}
                    </div>
                    <div className="text-sm text-fg-muted">{formatDateTime(lead.nextFollowUpAt)}</div>
                  </>
                ) : (
                  <div className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-300">Not scheduled</div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    { d: 1, l: "+1 day" },
                    { d: 3, l: "+3 days" },
                    { d: 7, l: "+1 week" },
                  ].map((q) => (
                    <ActionButton key={q.d} action={setLeadFollowUp} hidden={{ id: lead.id, days: q.d }} variant="soft">
                      {q.l}
                    </ActionButton>
                  ))}
                </div>
                <ActionForm action={setLeadFollowUp} resetOnSuccess={false} className="mt-3 flex gap-2">
                  <input type="hidden" name="id" value={lead.id} />
                  <Input type="datetime-local" name="nextFollowUp" defaultValue={toDateTimeLocalIST(lead.nextFollowUpAt)} className="h-9 flex-1" required aria-label="Follow-up date and time" />
                  <SubmitButton size="sm" variant="secondary">
                    Set
                  </SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={contact?.name ?? "Contact"} icon={<User className="h-4.5 w-4.5" />} description={contact ? [contact.role, contact.phone, contact.email].filter(Boolean).join(" · ") || "No details yet" : "No contact linked — edit the lead to add one"} />
            <CardBody className="space-y-3">
              {contact ? <ContactButtons phone={contact.phone} whatsapp={contact.whatsapp} email={contact.email} /> : null}
              <div className="flex flex-col gap-1 text-sm">
                {contact ? (
                  <Link href={`/crm/contacts/${contact.id}`} className="inline-flex items-center gap-2 font-semibold text-brand hover:underline">
                    <User className="h-3.5 w-3.5" /> View contact
                  </Link>
                ) : null}
                {company ? (
                  <Link href={`/crm/companies/${company.id}`} className="inline-flex items-center gap-2 font-semibold text-brand hover:underline">
                    <Building2 className="h-3.5 w-3.5" /> {company.name}
                    {company.gstin ? <span className="text-xs font-normal text-fg-subtle">{company.gstin}</span> : null}
                  </Link>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tasks" icon={<ListTodo className="h-4.5 w-4.5" />} description={d.tasks.length ? `${d.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length} open` : "Nothing yet"} />
            <CardBody className="space-y-3">
              {d.tasks.length ? (
                <ul className="space-y-1.5">
                  {d.tasks.map((t) => {
                    const doneT = t.status === "done" || t.status === "cancelled";
                    const overdue = !doneT && t.dueDate && t.dueDate < today;
                    return (
                      <li key={t.id}>
                        <Link href={`/tasks/${t.id}`} className="flex items-start gap-2 rounded-lg px-1.5 py-1 transition hover:bg-brand-soft">
                          {doneT ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />}
                          <span className={cn("min-w-0 flex-1 text-sm", doneT ? "text-fg-subtle line-through" : "font-medium text-fg")}>{t.title}</span>
                          {t.dueDate ? <span className={cn("shrink-0 text-[11px]", overdue ? "font-bold text-rose-600 dark:text-rose-300" : "text-fg-subtle")}>{formatDay(t.dueDate, { short: true })}</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <ActionForm action={addLeadTask} className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="leadId" value={lead.id} />
                <Input name="title" placeholder="Add a task…" className="h-9 flex-1" required />
                <div className="flex gap-2">
                  <Input type="date" name="dueDate" defaultValue={today} className="h-9 w-[150px]" aria-label="Due date" />
                  <SubmitButton size="sm" variant="soft">
                    <Plus className="h-3.5 w-3.5" />
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Quotes & invoices"
              icon={<FileText className="h-4.5 w-4.5" />}
              actions={
                <LinkButton href={`/sales/quotes?new=1&lead=${lead.id}`} size="sm" variant="ghost">
                  <Plus className="h-3.5 w-3.5" /> Quote
                </LinkButton>
              }
            />
            <CardBody className="space-y-1.5">
              {d.quotes.length === 0 && d.invoices.length === 0 ? <p className="text-sm text-fg-subtle">Send a quote when they&apos;re ready — it becomes the invoice when you win.</p> : null}
              {d.quotes.map((q) => {
                const s = displayQuoteStatus(q, today);
                return (
                  <Link key={q.id} href={`/sales/quotes/${q.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition hover:bg-brand-soft">
                    <span className="text-sm font-semibold tabular-nums text-fg">{q.number}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm tabular-nums text-fg-muted">{formatINRShort(q.totalPaise)}</span>
                      <Badge tone={QUOTE_STATUS_META[s].tone}>{QUOTE_STATUS_META[s].label}</Badge>
                    </span>
                  </Link>
                );
              })}
              {d.invoices.map((i) => (
                <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition hover:bg-brand-soft">
                  <span className="text-sm font-semibold tabular-nums text-fg">{i.number}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm tabular-nums text-fg-muted">{formatINRShort(i.totalPaise)}</span>
                    <InvoiceStatusBadge status={i.derived} />
                  </span>
                </Link>
              ))}
            </CardBody>
          </Card>

          <Attachments entityType="lead" entityId={lead.id} path={`/crm/leads/${lead.id}`} />
          <History entityType="lead" entityId={lead.id} />
          <div>
            <ActionButton action={deleteLead} hidden={{ id: lead.id }} variant="danger" confirm="Delete this lead and its activity log?">
              <Trash2 className="h-3.5 w-3.5" /> Delete lead
            </ActionButton>
          </div>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass rounded-2xl border border-line px-4 py-3 shadow-card">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-0.5 truncate text-lg font-extrabold tabular-nums text-fg">{value}</div>
      {sub ? <div className="truncate text-xs text-fg-muted">{sub}</div> : null}
    </div>
  );
}
