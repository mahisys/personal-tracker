import Link from "next/link";
import { BellRing, Building2, Columns3, Gauge, LayoutList, Plus, Settings2, Target, Trophy, Users } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { getPipeline, lookupOptions } from "@/server/crm/queries";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { StatTile } from "@/components/ui/stat";
import { LinkButton } from "@/components/ui/button";
import { Modal } from "@/components/client/modal";
import { LeadForm } from "@/components/crm/lead-form";
import { PipelineBoard } from "@/components/crm/pipeline-board";
import { CrmNav } from "@/components/crm/crm-nav";
import { formatINRShort } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata = { title: "CRM" };

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ new?: string; view?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const filter = await getWorkspaceFilter();
  const data = await getPipeline(filter);
  const options = await lookupOptions(data.workspace);
  const s = data.stats;

  const newLead = (open: boolean) => (
    <Modal
      trigger={
        <>
          <Plus className="h-4 w-4" /> New lead
        </>
      }
      title="New lead"
      description="Capture it now — details can come later."
      wide
      defaultOpen={open}
    >
      <LeadForm workspace={data.workspace} stages={data.stages} options={options} />
    </Modal>
  );

  return (
    <>
      <PageHeader
        eyebrow="MahiSys"
        title="Pipeline"
        description="Every open opportunity, where it stands and when you'll follow up next."
        actions={
          <>
            <LinkButton href="/crm/stages" variant="ghost" size="icon" aria-label="Edit stages" title="Edit stages">
              <Settings2 className="h-4.5 w-4.5" />
            </LinkButton>
            {newLead(sp.new === "1")}
          </>
        }
      />

      <CrmNav active="/crm" />

      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open pipeline" value={formatINRShort(s.openValue)} sub={`${data.leads.length} open lead${data.leads.length === 1 ? "" : "s"}`} icon={<Target className="h-5 w-5" />} tone="brand" />
        <StatTile label="Weighted value" value={formatINRShort(s.weighted)} sub="Value × probability" icon={<Gauge className="h-5 w-5" />} tone="violet" />
        <StatTile
          label="Follow-ups due"
          value={s.dueToday}
          sub={s.overdue ? `${s.overdue} overdue — start there` : s.dueToday ? "Due today" : "All caught up 🎉"}
          icon={<BellRing className="h-5 w-5" />}
          tone={s.overdue ? "bad" : s.dueToday ? "warn" : "good"}
          href="/crm?view=list"
        />
        <StatTile label="Won this month" value={formatINRShort(s.wonThisMonthValue)} sub={`${s.wonThisMonthCount} deal${s.wonThisMonthCount === 1 ? "" : "s"} closed`} icon={<Trophy className="h-5 w-5" />} tone="good" />
      </div>

      {data.stages.length === 0 ? (
        <EmptyState icon={<Columns3 className="h-6 w-6" />} title="Set up your pipeline stages" description="Stages are the steps a deal moves through, from first call to won." action={<LinkButton href="/crm/stages">Add stages</LinkButton>} />
      ) : data.leads.length === 0 && data.closedRecent.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No leads yet — add your first one" description="Every big client started as a single conversation. Note it down and set a follow-up." action={newLead(false)} />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-line bg-solid/60 p-1">
              <ViewLink href="/crm" on={view === "board"} icon={<Columns3 className="h-4 w-4" />} label="Board" />
              <ViewLink href="/crm?view=list" on={view === "list"} icon={<LayoutList className="h-4 w-4" />} label="By follow-up" />
            </div>
            <p className="hidden text-xs text-fg-subtle md:block">Drag cards between stages, or use the ⇄ button on a card.</p>
            <Link href="/crm/companies" className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-brand md:hidden">
              <Building2 className="h-3.5 w-3.5" /> Companies
            </Link>
          </div>
          <PipelineBoard stages={data.stages.map((st) => ({ id: st.id, name: st.name, kind: st.kind, probability: st.probability }))} leads={data.leads} closedRecent={data.closedRecent} view={view} />
        </>
      )}
    </>
  );
}

function ViewLink({ href, on, icon, label }: { href: string; on: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition", on ? "bg-fg text-bg shadow" : "text-fg-muted hover:text-fg")}>
      {icon}
      {label}
    </Link>
  );
}
