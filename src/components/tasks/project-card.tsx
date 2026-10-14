import Link from "next/link";
import { Building2, CalendarClock, Clock, IndianRupee } from "lucide-react";
import type { ProjectCard as ProjectCardData } from "@/server/tasks/projects";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressRing } from "@/components/ui/stat";
import { formatDay, formatMinutes } from "@/lib/dates";
import { formatINRShort } from "@/lib/money";
import { cn } from "@/lib/cn";
import { HEALTH_META, PROJECT_STATUS_META } from "./meta";

export function HealthBadge({ p, today }: { p: ProjectCardData; today: string }) {
  if (p.status === "done") return <Badge tone="good" dot>Delivered</Badge>;
  if (p.status === "cancelled") return null;
  if (!p.deadline) return <Badge tone="neutral">No deadline</Badge>;
  if (p.openTasks === 0) return p.deadline < today ? <Badge tone="neutral">No open tasks</Badge> : <Badge tone="good" dot>On track</Badge>;
  const h = p.eta?.health ?? "no_data";
  const meta = HEALTH_META[h === "no_data" ? "at_risk" : h];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

/** A short line explaining the ETA vs deadline. */
export function etaLine(p: ProjectCardData, today: string): string {
  if (p.status === "done") return "Completed";
  if (p.openTasks === 0) return p.totalTasks ? "All tasks done" : "No tasks yet";
  const eta = p.eta;
  const finish = eta?.finishDate;
  const parts: string[] = [];
  if (finish) parts.push(`ETA ${finish === today ? "today" : formatDay(finish, { short: true })}`);
  else parts.push("ETA unknown");
  if (p.deadline) parts.push(`due ${formatDay(p.deadline, { short: true })}`);
  if (eta?.unestimated) parts.push(`${eta.unestimated} unestimated`);
  return parts.join(" · ");
}

export function ProjectCard({ p, today }: { p: ProjectCardData; today: string }) {
  const pct = p.totalTasks ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0;
  const hours = p.minutesSpent / 60;
  const budgetPct = p.budgetHours ? Math.round((hours / p.budgetHours) * 100) : 0;
  const st = PROJECT_STATUS_META[p.status];
  return (
    <div className="glass group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop">
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br from-violet-500/15 to-transparent blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start gap-4">
        <ProgressRing value={pct} size={64} stroke={7} sub={`${p.doneTasks}/${p.totalTasks}`} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <WorkspaceBadge ws={p.workspace} />
            {p.status !== "active" ? <Badge tone={st.tone}>{st.label}</Badge> : null}
          </div>
          <Link href={`/projects/${p.id}`} className="block truncate text-base font-extrabold text-fg after:absolute after:inset-0 hover:text-brand">
            {p.name}
          </Link>
          {p.companyName ? (
            <Link href={`/crm/companies/${p.companyId}`} className="relative z-10 mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-fg-muted hover:text-brand">
              <Building2 className="h-3.5 w-3.5 shrink-0" /> {p.companyName}
            </Link>
          ) : p.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">{p.description}</p>
          ) : null}
        </div>
      </div>

      <div className="relative mt-5 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-fg-muted">
              <Clock className="h-3.5 w-3.5" /> {formatMinutes(p.minutesSpent || 0)} spent
            </span>
            <span className={cn("font-semibold tabular-nums", budgetPct > 100 ? "text-rose-600 dark:text-rose-300" : "text-fg-subtle")}>
              {p.budgetHours ? `of ${p.budgetHours}h budget` : "No budget"}
            </span>
          </div>
          {p.budgetHours ? <Progress value={budgetPct} tone={budgetPct > 100 ? "bad" : budgetPct > 85 ? "warn" : "brand"} /> : <div className="h-2 rounded-full bg-muted" />}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-fg-muted">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{etaLine(p, today)}</span>
          </span>
          <HealthBadge p={p} today={today} />
        </div>
      </div>

      {p.valuePaise ? (
        <div className="relative mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-fg-muted">
            <IndianRupee className="h-3.5 w-3.5" /> Value
          </span>
          <span className="font-extrabold tabular-nums text-fg">{formatINRShort(p.valuePaise)}</span>
        </div>
      ) : null}
    </div>
  );
}
