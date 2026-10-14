import Link from "next/link";
import { Plus, UserRound } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { listCompanies, listContacts } from "@/server/crm/queries";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/client/modal";
import { CrmNav } from "@/components/crm/crm-nav";
import { ContactForm } from "@/components/crm/party-forms";
import { SearchBox } from "@/components/crm/search-box";
import { ContactButtons } from "@/components/crm/bits";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";

export const metadata = { title: "Contacts" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; new?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() || null;
  const filter = await getWorkspaceFilter();
  const [rows, companyRows] = await Promise.all([listContacts(filter, q), listCompanies(filter, null)]);
  const ws = filter ?? "mahisys";
  const companyNames = companyRows.map((c) => c.company.name);

  const addModal = (open: boolean) => (
    <Modal
      trigger={
        <>
          <Plus className="h-4 w-4" /> New contact
        </>
      }
      title="New contact"
      description="Someone worth staying in touch with."
      wide
      defaultOpen={open}
    >
      <ContactForm workspace={ws} companyNames={companyNames} redirectToDetail />
    </Modal>
  );

  return (
    <>
      <PageHeader eyebrow="CRM" title="Contacts" description="The people behind your deals — one tap to call, WhatsApp or email." actions={addModal(sp.new === "1")} />
      <CrmNav active="/crm/contacts" />
      <SearchBox action="/crm/contacts" q={q} placeholder="Search by name, phone, email, company or city" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<UserRound className="h-6 w-6" />}
          title={q ? `No one matches “${q}”` : "No contacts yet — add your first one"}
          description={q ? "Try a shorter search, or add them as a new contact." : "Contacts you add with leads show up here too."}
          action={addModal(false)}
        />
      ) : (
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ contact: c, companyName, openLeads }) => (
            <div key={c.id} className="glass group rounded-2xl border border-line p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop">
              <Link href={`/crm/contacts/${c.id}`} className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] text-sm font-extrabold text-white">{initials(c.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold text-fg group-hover:text-brand">{c.name}</span>
                    {!filter ? <WorkspaceBadge ws={c.workspace} /> : null}
                  </div>
                  <div className="truncate text-xs text-fg-muted">{[c.role, companyName].filter(Boolean).join(" · ") || c.city || "—"}</div>
                  {openLeads ? (
                    <Badge tone="brand" className="mt-1.5">
                      {openLeads} open lead{openLeads === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
              </Link>
              <div className="mt-3">
                <ContactButtons phone={c.phone} whatsapp={c.whatsapp} email={c.email} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
