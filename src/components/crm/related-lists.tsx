import Link from "next/link";
import { Briefcase, FileText, FolderKanban } from "lucide-react";
import type { invoices, leads, projects, StageKind } from "@/db/schema";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-bits";
import type { DerivedInvoiceStatus } from "@/server/invoices/status";
import { formatDay } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";
import { StageBadge } from "./bits";

type LeadRow = { lead: typeof leads.$inferSelect; stageName: string; stageKind: StageKind };
type InvoiceRow = typeof invoices.$inferSelect & { derived: DerivedInvoiceStatus; balancePaise: number };
type ProjectRow = typeof projects.$inferSelect;

export function LeadsCard({ rows, newHref }: { rows: LeadRow[]; newHref?: string }) {
  return (
    <Card>
      <CardHeader
        title="Leads"
        icon={<Briefcase className="h-4.5 w-4.5" />}
        description={rows.length ? `${rows.filter((r) => r.stageKind === "open").length} open · ${rows.filter((r) => r.stageKind === "won").length} won` : "None yet"}
        actions={
          newHref ? (
            <Link href={newHref} className="text-xs font-bold text-brand hover:underline">
              + New lead
            </Link>
          ) : null
        }
      />
      <CardBody className="space-y-1">
        {rows.length === 0 ? <p className="text-sm text-fg-subtle">No leads linked yet.</p> : null}
        {rows.map((r) => (
          <Link key={r.lead.id} href={`/crm/leads/${r.lead.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition hover:bg-brand-soft">
            <span className="min-w-0 truncate text-sm font-semibold text-fg">{r.lead.title}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-sm tabular-nums text-fg-muted">{formatINRShort(r.lead.valuePaise)}</span>
              <StageBadge name={r.stageName} kind={r.stageKind} />
            </span>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

export function InvoicesCard({ rows, newHref }: { rows: InvoiceRow[]; newHref?: string }) {
  const outstanding = rows.filter((r) => r.derived !== "cancelled" && r.derived !== "draft").reduce((s, r) => s + r.balancePaise, 0);
  return (
    <Card>
      <CardHeader
        title="Invoices"
        icon={<FileText className="h-4.5 w-4.5" />}
        description={rows.length ? (outstanding ? `${formatINR(outstanding)} outstanding` : "All settled") : "None yet"}
        actions={
          newHref ? (
            <Link href={newHref} className="text-xs font-bold text-brand hover:underline">
              + New invoice
            </Link>
          ) : null
        }
      />
      <CardBody className="space-y-1">
        {rows.length === 0 ? <p className="text-sm text-fg-subtle">No invoices yet.</p> : null}
        {rows.map((i) => (
          <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition hover:bg-brand-soft">
            <span className="min-w-0">
              <span className="block text-sm font-semibold tabular-nums text-fg">{i.number}</span>
              <span className="text-[11px] text-fg-subtle">{formatDay(i.issueDate, { short: true })}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-sm tabular-nums text-fg-muted">{formatINRShort(i.totalPaise)}</span>
              <InvoiceStatusBadge status={i.derived} />
            </span>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

const PROJECT_TONE = { planned: "info", active: "brand", on_hold: "warn", done: "good", cancelled: "neutral" } as const;

export function ProjectsCard({ rows }: { rows: ProjectRow[] }) {
  return (
    <Card>
      <CardHeader title="Projects" icon={<FolderKanban className="h-4.5 w-4.5" />} description={rows.length ? `${rows.length} total` : "None yet"} />
      <CardBody className="space-y-1">
        {rows.length === 0 ? <p className="text-sm text-fg-subtle">Projects appear here when you win a deal.</p> : null}
        {rows.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition hover:bg-brand-soft">
            <span className="min-w-0 truncate text-sm font-semibold text-fg">{p.name}</span>
            <Badge tone={PROJECT_TONE[p.status]}>{p.status.replace("_", " ")}</Badge>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}
