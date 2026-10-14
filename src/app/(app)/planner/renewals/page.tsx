import { FileBadge2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { listRenewals } from "@/server/planner/queries";
import { deleteRenewal } from "@/server/planner/actions";
import { renewalUrgency } from "@/server/planner/bills";
import { formatDay, formatDateTime, todayIST } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { PageHeader, EmptyState, Section } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/client/action-form";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { PlannerNav } from "@/components/planner/bill-card";
import { RenewDialog, RenewalDialog } from "@/components/planner/renewal-dialogs";

export default async function RenewalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const ws = await getWorkspaceFilter();
  const today = todayIST();
  const rows = (await listRenewals(ws)).map((r) => ({ ...r, u: renewalUrgency(r.expiresOn, today, r.remindDaysBefore) }));
  const attention = rows.filter((r) => r.u.tone === "bad" || r.u.tone === "warn");
  const fine = rows.filter((r) => !(r.u.tone === "bad" || r.u.tone === "warn"));

  return (
    <>
      <PageHeader
        eyebrow="Planner"
        title="Renewals"
        description="Passports, licences, insurance, PUC, GST and trade licences — never let one lapse."
        actions={<RenewalDialog key={String(sp.new)} trigger={<><Plus className="h-4 w-4" /> Track an expiry</>} defaults={{ workspace: ws ?? "personal" }} defaultOpen={sp.new === "1"} />}
      />
      <PlannerNav active="/planner/renewals" />

      {rows.length === 0 ? (
        <EmptyState icon={<FileBadge2 className="h-6 w-6" />} title="Nothing tracked yet" description="Add your vehicle insurance, PUC, passport or trade licence — we'll nudge you before each one expires." />
      ) : (
        <>
          {attention.length ? (
            <Section title={`Needs attention · ${attention.length}`}>
              <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
                {attention.map((r) => (
                  <RenewalCard key={r.id} r={r} />
                ))}
              </div>
            </Section>
          ) : (
            <Card className="mb-8 flex items-center gap-3 p-4 text-sm animate-fade-up">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
              <span><span className="font-bold text-fg">All valid.</span> <span className="text-fg-muted">Nothing is due for renewal soon.</span></span>
            </Card>
          )}
          {fine.length ? (
            <Section title="Coming up later">
              <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
                {fine.map((r) => (
                  <RenewalCard key={r.id} r={r} />
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </>
  );
}

type Row = Awaited<ReturnType<typeof listRenewals>>[number] & { u: ReturnType<typeof renewalUrgency> };

function RenewalCard({ r }: { r: Row }) {
  const ring = r.u.tone === "bad" ? "border-rose-500/30" : r.u.tone === "warn" ? "border-amber-500/30" : "border-line";
  return (
    <Card className={cn("group p-4", ring)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-bold text-fg">{r.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            {r.kind ? <span>{r.kind}</span> : null}
            {r.number ? <span className="font-mono">· {r.number}</span> : null}
            <WorkspaceBadge ws={r.workspace} />
          </div>
        </div>
        <Badge tone={r.u.tone} dot>{r.u.label}</Badge>
      </div>
      <div className="mt-3 text-sm text-fg-muted">
        {r.u.days < 0 ? "Expired" : "Expires"} <span className="font-semibold text-fg">{formatDay(r.expiresOn)}</span>
        {r.renewedAt ? <span className="text-xs text-fg-subtle"> · last renewed {formatDateTime(r.renewedAt)}</span> : null}
      </div>
      {r.notes ? <p className="mt-1 line-clamp-2 text-xs text-fg-subtle">{r.notes}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <RenewDialog id={r.id} name={r.name} expiresOn={r.expiresOn} number={r.number} />
        <RenewalDialog trigger={<Pencil className="h-3.5 w-3.5" />} variant="ghost" size="icon" triggerClassName="h-8 w-8" defaults={{ ...r }} />
        <ActionButton action={deleteRenewal} hidden={{ id: r.id }} variant="ghost" size="icon" className="h-8 w-8" confirm={`Stop tracking ${r.name}?`} title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </ActionButton>
      </div>
    </Card>
  );
}
