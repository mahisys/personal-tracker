import Link from "next/link";
import { Clock3, Timer } from "lucide-react";
import { WORKSPACE_KEYS } from "@/db/schema";
import { getWorkspaceFilter } from "@/server/workspace";
import { getTimeReport } from "@/server/reports/queries";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { StatTile, Progress } from "@/components/ui/stat";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { LinkButton } from "@/components/ui/button";
import { TimeChart } from "@/components/reports/charts";
import { ParamToggle } from "@/components/reports/report-nav";
import { formatDay, formatMinutes, todayIST } from "@/lib/dates";
import { WORKSPACE_META } from "@/lib/workspaces";

export default async function TimeReportPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const sp = await searchParams;
  const weeks = sp.weeks === "12" ? 12 : 4;
  const today = todayIST();
  const ws = await getWorkspaceFilter();
  const t = await getTimeReport(weeks, today, ws);
  const perWeek = Math.round(t.total / weeks);
  const top = (ws ? [ws] : WORKSPACE_KEYS).map((k) => ({ k, m: t.byWorkspace[k] })).sort((a, b) => b.m - a.m)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Tracked time from task timers, since {formatDay(t.from, { short: true })}.</p>
        <ParamToggle
          param="weeks"
          value={String(weeks)}
          options={[
            { value: "4", label: "4 weeks" },
            { value: "12", label: "12 weeks" },
          ]}
        />
      </div>

      {t.total === 0 ? (
        <EmptyState icon={<Timer className="h-6 w-6" />} title="No time tracked yet" description="Start a timer on any task and your hours show up here, by workspace and project." action={<LinkButton href="/tasks">Go to tasks</LinkButton>} />
      ) : (
        <>
          <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Total tracked" value={formatMinutes(t.total)} icon={<Clock3 className="h-5 w-5" />} tone="brand" />
            <StatTile label="Per week" value={formatMinutes(perWeek)} tone="info" sub="average" />
            <StatTile label="Most time" value={top && top.m ? WORKSPACE_META[top.k].short : "—"} tone="violet" sub={top && t.total ? `${Math.round((top.m / t.total) * 100)}% of your hours` : undefined} />
            <StatTile label="Projects" value={t.projects.filter((p) => p.id).length} tone="good" sub="with time logged" />
          </div>

          <Card>
            <CardHeader title="Hours per week" description="Stacked by workspace" />
            <CardBody>
              <TimeChart data={t.series.map((s) => ({ label: formatDay(s.week, { short: true }), personal: s.personal, mahisys: s.mahisys, dsa: s.dsa }))} />
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="By workspace" />
              <CardBody className="space-y-4">
                {(ws ? [ws] : WORKSPACE_KEYS).map((k) => (
                  <div key={k}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <WorkspaceBadge ws={k} />
                      <span className="text-sm font-bold tabular-nums">{formatMinutes(t.byWorkspace[k])}</span>
                    </div>
                    <Progress value={t.total ? (t.byWorkspace[k] / t.total) * 100 : 0} />
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="By project" />
              <CardBody>
                <ul className="divide-y divide-line">
                  {t.projects.slice(0, 10).map((p) => (
                    <li key={`${p.id}-${p.workspace}`} className="flex items-center gap-3 py-2.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${WORKSPACE_META[p.workspace].dot}`} />
                      {p.id ? (
                        <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-fg hover:text-brand">
                          {p.name}
                        </Link>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                          {p.name} · {WORKSPACE_META[p.workspace].short}
                        </span>
                      )}
                      <span className="text-sm font-bold tabular-nums">{formatMinutes(p.minutes)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
