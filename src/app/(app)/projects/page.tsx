import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Clock, FolderKanban, IndianRupee } from "lucide-react";
import type { ProjectStatus } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { getCompanyOptions, listProjects } from "@/server/tasks/projects";
import { EmptyState, PageHeader, SubNav } from "@/components/ui/page";
import { StatTile } from "@/components/ui/stat";
import { ProjectCard } from "@/components/tasks/project-card";
import { NewProjectButton } from "@/components/tasks/project-form";
import { formatMinutes, todayIST } from "@/lib/dates";
import { formatINRShort } from "@/lib/money";
import { WORKSPACE_META } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Projects" };

const FILTERS: { key: string; label: string; status: ProjectStatus | "open" | null }[] = [
  { key: "open", label: "In progress", status: "open" },
  { key: "active", label: "Active", status: "active" },
  { key: "planned", label: "Planned", status: "planned" },
  { key: "on_hold", label: "On hold", status: "on_hold" },
  { key: "done", label: "Done", status: "done" },
  { key: "all", label: "All", status: null },
];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const ws = await getWorkspaceFilter();
  const key = typeof sp.status === "string" && FILTERS.some((f) => f.key === sp.status) ? sp.status : "open";
  const filter = FILTERS.find((f) => f.key === key)!;
  const today = todayIST();

  const [list, all, companies] = await Promise.all([listProjects(ws, filter.status), key === "all" ? null : listProjects(ws, null), getCompanyOptions()]);
  const everything = all ?? list;
  const counts = new Map<string, number>();
  for (const f of FILTERS) {
    counts.set(
      f.key,
      everything.filter((p) => (f.status === null ? true : f.status === "open" ? ["planned", "active", "on_hold"].includes(p.status) : p.status === f.status)).length,
    );
  }

  const live = everything.filter((p) => ["planned", "active", "on_hold"].includes(p.status));
  const atRisk = live.filter((p) => p.openTasks > 0 && p.eta && (p.eta.health === "late" || p.eta.health === "at_risk")).length;
  const minutes = live.reduce((s, p) => s + p.minutesSpent, 0);
  const value = live.reduce((s, p) => s + (p.valuePaise ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={ws ? `Focus · ${WORKSPACE_META[ws].name}` : "Focus"}
        title="Projects"
        description="Progress, hours and whether you'll make the deadline — at a glance."
        actions={<NewProjectButton companies={companies} defaultWorkspace={ws ?? "mahisys"} />}
      />

      {live.length > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 stagger">
          <StatTile label="In progress" value={live.length} icon={<FolderKanban className="h-5 w-5" />} tone="brand" />
          <StatTile
            label="Need attention"
            value={atRisk}
            sub={atRisk ? "At risk or late" : "Everything on track"}
            icon={atRisk ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            tone={atRisk ? "warn" : "good"}
          />
          <StatTile label="Time invested" value={formatMinutes(minutes || 0)} icon={<Clock className="h-5 w-5" />} tone="info" />
          <StatTile label="Value in play" value={formatINRShort(value)} icon={<IndianRupee className="h-5 w-5" />} tone="good" />
        </div>
      ) : null}

      <SubNav items={FILTERS.map((f) => ({ href: f.key === "open" ? "/projects" : `/projects?status=${f.key}`, label: f.label, count: counts.get(f.key) }))} active={key === "open" ? "/projects" : `/projects?status=${key}`} />

      {list.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-6 w-6" />}
          title={key === "open" || key === "all" ? "No projects yet — start your first one" : `No ${filter.label.toLowerCase()} projects`}
          description={key === "open" || key === "all" ? "Projects group tasks so you can see progress, hours and an honest ETA." : "Nothing here right now."}
          action={key === "open" || key === "all" ? <NewProjectButton companies={companies} defaultWorkspace={ws ?? "mahisys"} label="Create a project" /> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
          {list.map((p) => (
            <ProjectCard key={p.id} p={p} today={today} />
          ))}
        </div>
      )}
    </>
  );
}
