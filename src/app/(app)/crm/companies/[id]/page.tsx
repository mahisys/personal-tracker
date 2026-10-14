import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, CalendarClock, Globe, Mail, MapPin, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getCompanyDetail } from "@/server/crm/queries";
import { deleteCompany } from "@/server/crm/actions";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat";
import { ActionButton } from "@/components/client/action-form";
import { Modal } from "@/components/client/modal";
import { Attachments } from "@/components/shared/attachments";
import { History } from "@/components/shared/history";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { ActivityTimeline, ContactButtons } from "@/components/crm/bits";
import { CompanyForm } from "@/components/crm/party-forms";
import { InvoicesCard, LeadsCard, ProjectsCard } from "@/components/crm/related-lists";
import { INDIAN_STATES } from "@/lib/gst";
import { formatINRShort } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await getCompanyDetail(id) : null;
  return { title: d?.company.name ?? "Company" };
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getCompanyDetail(id);
  if (!d) notFound();
  const c = d.company;
  const state = INDIAN_STATES.find((s) => s.code === c.stateCode)?.name;
  const live = d.invoices.filter((i) => i.derived !== "draft" && i.derived !== "cancelled");
  const billed = live.reduce((s, i) => s + i.totalPaise, 0);
  const outstanding = live.reduce((s, i) => s + i.balancePaise, 0);
  const pipeline = d.leads.filter((l) => l.stageKind === "open").reduce((s, l) => s + l.lead.valuePaise, 0);
  const leadTitles = new Map(d.leads.map((l) => [l.lead.id, l.lead.title]));

  return (
    <>
      <Link href="/crm/companies" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Companies
      </Link>
      <PageHeader
        eyebrow={<WorkspaceBadge ws={c.workspace} />}
        title={c.name}
        description={[c.industry, c.city, state].filter(Boolean).join(" · ") || "Company"}
        actions={
          <>
            <Modal
              trigger={
                <>
                  <Pencil className="h-4 w-4" /> Edit
                </>
              }
              variant="secondary"
              title="Edit company"
              wide
            >
              <CompanyForm company={c} workspace={c.workspace} />
            </Modal>
            <LinkButton href={`/invoices/new?company=${c.id}`}>
              <Plus className="h-4 w-4" /> Invoice
            </LinkButton>
          </>
        }
      />

      <div className="stagger mb-6 grid grid-cols-3 gap-3">
        <StatTile label="Billed" className="p-3.5 sm:p-5" value={formatINRShort(billed)} tone="brand" />
        <StatTile label="Outstanding" className="p-3.5 sm:p-5" value={formatINRShort(outstanding)} tone={outstanding ? "warn" : "good"} />
        <StatTile label="Open pipeline" className="p-3.5 sm:p-5" value={formatINRShort(pipeline)} tone="violet" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <LeadsCard rows={d.leads} newHref="/crm?new=1" />
          <InvoicesCard rows={d.invoices} newHref={`/invoices/new?company=${c.id}`} />
          <Card>
            <CardHeader title="Interactions" icon={<CalendarClock className="h-4.5 w-4.5" />} />
            <CardBody>
              <ActivityTimeline items={d.activities} showLead leadTitles={leadTitles} />
            </CardBody>
          </Card>
        </div>
        <div className="stagger space-y-6">
          <Card>
            <CardHeader title="Details" icon={<BadgeCheck className="h-4.5 w-4.5" />} />
            <CardBody className="space-y-3 text-sm">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">GSTIN</div>
                <div className="font-mono font-semibold text-fg">{c.gstin ?? "Unregistered"}</div>
                {state ? (
                  <div className="text-xs text-fg-muted">
                    {state} ({c.stateCode})
                  </div>
                ) : null}
              </div>
              {c.address ? (
                <div className="flex gap-2.5 text-fg">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                  <span className="whitespace-pre-line">{c.address}</span>
                </div>
              ) : null}
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="flex items-center gap-2.5 text-fg hover:text-brand">
                  <Phone className="h-3.5 w-3.5 text-fg-subtle" /> {c.phone}
                </a>
              ) : null}
              {c.email ? (
                <a href={`mailto:${c.email}`} className="flex items-center gap-2.5 text-fg hover:text-brand">
                  <Mail className="h-3.5 w-3.5 text-fg-subtle" /> {c.email}
                </a>
              ) : null}
              {c.website ? (
                <a href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-fg hover:text-brand">
                  <Globe className="h-3.5 w-3.5 text-fg-subtle" /> {c.website}
                </a>
              ) : null}
              {c.notes ? <p className="whitespace-pre-line rounded-xl bg-muted/60 p-3 text-fg-muted">{c.notes}</p> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="People"
              icon={<Users className="h-4.5 w-4.5" />}
              description={d.contacts.length ? `${d.contacts.length} contact${d.contacts.length === 1 ? "" : "s"}` : "No one yet"}
              actions={
                <Link href="/crm/contacts?new=1" className="text-xs font-bold text-brand hover:underline">
                  + Add
                </Link>
              }
            />
            <CardBody className="space-y-3">
              {d.contacts.map((p) => (
                <div key={p.id} className="rounded-xl border border-line bg-solid/50 p-3">
                  <Link href={`/crm/contacts/${p.id}`} className="block font-semibold text-fg hover:text-brand">
                    {p.name}
                  </Link>
                  {p.role ? <div className="text-xs text-fg-subtle">{p.role}</div> : null}
                  <div className="mt-2">
                    <ContactButtons phone={p.phone} whatsapp={p.whatsapp} email={p.email} />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
          <ProjectsCard rows={d.projects} />
          <Attachments entityType="company" entityId={c.id} path={`/crm/companies/${c.id}`} />
          <History entityType="company" entityId={c.id} />
          <ActionButton action={deleteCompany} hidden={{ id: c.id }} variant="danger" confirm="Delete this company? Contacts, leads and invoices stay, unlinked.">
            <Trash2 className="h-3.5 w-3.5" /> Delete company
          </ActionButton>
        </div>
      </div>
    </>
  );
}
