import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { listCompanies } from "@/server/crm/queries";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { Modal } from "@/components/client/modal";
import { CrmNav } from "@/components/crm/crm-nav";
import { CompanyForm } from "@/components/crm/party-forms";
import { SearchBox } from "@/components/crm/search-box";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { INDIAN_STATES } from "@/lib/gst";
import { formatINRShort } from "@/lib/money";

export const metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; new?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() || null;
  const filter = await getWorkspaceFilter();
  const rows = await listCompanies(filter, q);
  const ws = filter ?? "mahisys";
  const stateName = (code: string | null) => INDIAN_STATES.find((s) => s.code === code)?.name ?? null;

  const addModal = (open: boolean) => (
    <Modal
      trigger={
        <>
          <Plus className="h-4 w-4" /> New company
        </>
      }
      title="New company"
      description="Add their GSTIN and we'll fill in the state for invoices."
      wide
      defaultOpen={open}
    >
      <CompanyForm workspace={ws} redirectToDetail />
    </Modal>
  );

  return (
    <>
      <PageHeader eyebrow="CRM" title="Companies" description="Clients and prospects, with the GST details invoices need." actions={addModal(sp.new === "1")} />
      <CrmNav active="/crm/companies" />
      <SearchBox action="/crm/companies" q={q} placeholder="Search by name, GSTIN, city or industry" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title={q ? `No company matches “${q}”` : "No companies yet — add your first client"}
          description="Companies hold the billing details used on quotes and invoices."
          action={addModal(false)}
        />
      ) : (
        <>
          <div className="stagger space-y-3 md:hidden">
            {rows.map(({ company: c, contactCount, billed }) => (
              <Link key={c.id} href={`/crm/companies/${c.id}`} className="glass block rounded-2xl border border-line p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-fg">{c.name}</div>
                    <div className="truncate text-xs text-fg-muted">{[c.industry, c.city ?? stateName(c.stateCode)].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-extrabold tabular-nums text-fg">{billed ? formatINRShort(Number(billed)) : "—"}</div>
                    <div className="text-[10px] text-fg-subtle">billed</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-fg-subtle">
                  {c.gstin ? <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-fg-muted">{c.gstin}</span> : <span>Unregistered</span>}
                  <span>· {contactCount ?? 0} contact{contactCount === 1 ? "" : "s"}</span>
                </div>
              </Link>
            ))}
          </div>
          <TableWrap className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Company</TH>
                  <TH>GSTIN</TH>
                  <TH>State</TH>
                  <TH className="text-right">Contacts</TH>
                  <TH className="text-right">Billed</TH>
                </tr>
              </THead>
              <tbody className="stagger">
                {rows.map(({ company: c, contactCount, billed }) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/crm/companies/${c.id}`} className="font-bold text-fg hover:text-brand">
                        {c.name}
                      </Link>
                      {!filter ? <WorkspaceBadge ws={c.workspace} className="ml-2" /> : null}
                      {c.industry ? <div className="text-xs text-fg-subtle">{c.industry}</div> : null}
                    </TD>
                    <TD className="font-mono text-xs text-fg-muted">{c.gstin ?? "—"}</TD>
                    <TD className="text-fg-muted">{stateName(c.stateCode) ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{contactCount ?? 0}</TD>
                    <TD className="text-right font-semibold tabular-nums">{billed ? formatINRShort(Number(billed)) : "—"}</TD>
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
