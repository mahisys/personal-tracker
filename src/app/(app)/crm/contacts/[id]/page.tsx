import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarClock, Mail, MapPin, Pencil, Phone, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getContactDetail, listCompanies } from "@/server/crm/queries";
import { deleteContact } from "@/server/crm/actions";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionButton } from "@/components/client/action-form";
import { Modal } from "@/components/client/modal";
import { Attachments } from "@/components/shared/attachments";
import { History } from "@/components/shared/history";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { ActivityTimeline, ContactButtons } from "@/components/crm/bits";
import { ContactForm } from "@/components/crm/party-forms";
import { InvoicesCard, LeadsCard, ProjectsCard } from "@/components/crm/related-lists";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await getContactDetail(id) : null;
  return { title: d?.contact.name ?? "Contact" };
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getContactDetail(id);
  if (!d) notFound();
  const { contact: c, company } = d;
  const companyNames = (await listCompanies(c.workspace, null)).map((r) => r.company.name);
  const leadTitles = new Map(d.leads.map((l) => [l.lead.id, l.lead.title]));

  return (
    <>
      <Link href="/crm/contacts" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Contacts
      </Link>
      <PageHeader
        eyebrow={<WorkspaceBadge ws={c.workspace} />}
        title={c.name}
        description={[c.role, company?.name, c.city].filter(Boolean).join(" · ") || "Contact"}
        actions={
          <Modal
            trigger={
              <>
                <Pencil className="h-4 w-4" /> Edit
              </>
            }
            variant="secondary"
            title="Edit contact"
            wide
          >
            <ContactForm contact={c} companyName={company?.name} workspace={c.workspace} companyNames={companyNames} />
          </Modal>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <LeadsCard rows={d.leads} newHref="/crm?new=1" />
          <Card>
            <CardHeader title="Interactions" icon={<CalendarClock className="h-4.5 w-4.5" />} description="Calls, meetings and messages across their leads" />
            <CardBody>
              <ActivityTimeline items={d.activities} showLead leadTitles={leadTitles} />
            </CardBody>
          </Card>
          <InvoicesCard rows={d.invoices} />
        </div>
        <div className="stagger space-y-6">
          <Card>
            <CardHeader title="Reach out" />
            <CardBody className="space-y-4">
              <ContactButtons phone={c.phone} whatsapp={c.whatsapp} email={c.email} size="md" />
              <dl className="space-y-2 text-sm">
                {c.phone ? <Row icon={<Phone className="h-3.5 w-3.5" />} value={c.phone} /> : null}
                {c.email ? <Row icon={<Mail className="h-3.5 w-3.5" />} value={c.email} /> : null}
                {c.city ? <Row icon={<MapPin className="h-3.5 w-3.5" />} value={c.city} /> : null}
                {company ? (
                  <Row
                    icon={<Building2 className="h-3.5 w-3.5" />}
                    value={
                      <Link href={`/crm/companies/${company.id}`} className="font-semibold text-brand hover:underline">
                        {company.name}
                      </Link>
                    }
                  />
                ) : null}
              </dl>
              {c.source ? <p className="text-xs text-fg-subtle">Source: {c.source}</p> : null}
              {c.notes ? <p className="whitespace-pre-line rounded-xl bg-muted/60 p-3 text-sm text-fg-muted">{c.notes}</p> : null}
            </CardBody>
          </Card>
          <ProjectsCard rows={d.projects} />
          <Attachments entityType="contact" entityId={c.id} path={`/crm/contacts/${c.id}`} />
          <History entityType="contact" entityId={c.id} />
          <ActionButton action={deleteContact} hidden={{ id: c.id }} variant="danger" confirm="Delete this contact? Their leads stay, unlinked.">
            <Trash2 className="h-3.5 w-3.5" /> Delete contact
          </ActionButton>
        </div>
      </div>
    </>
  );
}

function Row({ icon, value }: { icon: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-fg">
      <span className="text-fg-subtle">{icon}</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}
