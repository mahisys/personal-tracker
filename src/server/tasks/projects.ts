import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, invoices, milestones, projects, tasks, timeEntries, type ProjectStatus, type WorkspaceKey } from "@/db/schema";
import type { ProjectEta } from "./eta";
import { getEta, toViews } from "./queries";

export type ProjectCard = {
  id: string;
  name: string;
  description: string;
  workspace: WorkspaceKey;
  status: ProjectStatus;
  companyId: string | null;
  companyName: string | null;
  startDate: string | null;
  deadline: string | null;
  budgetHours: number | null;
  valuePaise: number | null;
  totalTasks: number;
  doneTasks: number;
  openTasks: number;
  minutesSpent: number;
  eta: ProjectEta | null;
};

async function taskStats(projectIds: string[]) {
  if (projectIds.length === 0) return { counts: new Map<string, { total: number; done: number; open: number }>(), minutes: new Map<string, number>() };
  const [countRows, minuteRows] = await Promise.all([
    db
      .select({
        projectId: tasks.projectId,
        total: sql<number>`count(*) filter (where ${tasks.status} <> 'cancelled')::int`,
        done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
        open: sql<number>`count(*) filter (where ${tasks.status} in ('todo','doing','waiting'))::int`,
      })
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds))
      .groupBy(tasks.projectId),
    db
      .select({ projectId: tasks.projectId, m: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)::int` })
      .from(timeEntries)
      .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .where(inArray(tasks.projectId, projectIds))
      .groupBy(tasks.projectId),
  ]);
  return {
    counts: new Map(countRows.map((r) => [r.projectId!, { total: r.total, done: r.done, open: r.open }])),
    minutes: new Map(minuteRows.map((r) => [r.projectId!, Number(r.m)])),
  };
}

export async function listProjects(ws: WorkspaceKey | null, status?: ProjectStatus | "open" | null): Promise<ProjectCard[]> {
  const conds = [];
  if (ws) conds.push(eq(projects.workspace, ws));
  if (status === "open") conds.push(inArray(projects.status, ["planned", "active", "on_hold"]));
  else if (status) conds.push(eq(projects.status, status));
  const rows = await db
    .select({ p: projects, companyName: companies.name })
    .from(projects)
    .leftJoin(companies, eq(companies.id, projects.companyId))
    .where(and(...conds))
    .orderBy(sql`case ${projects.status} when 'active' then 0 when 'planned' then 1 when 'on_hold' then 2 when 'done' then 3 else 4 end`, sql`${projects.deadline} asc nulls last`, asc(projects.name));
  const ids = rows.map((r) => r.p.id);
  const [{ counts, minutes }, eta] = await Promise.all([taskStats(ids), getEta()]);
  return rows.map(({ p, companyName }) => toCard(p, companyName, counts.get(p.id), minutes.get(p.id) ?? 0, eta.projects[p.id] ?? null));
}

function toCard(
  p: typeof projects.$inferSelect,
  companyName: string | null,
  c: { total: number; done: number; open: number } | undefined,
  minutesSpent: number,
  eta: ProjectEta | null,
): ProjectCard {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    workspace: p.workspace,
    status: p.status,
    companyId: p.companyId,
    companyName,
    startDate: p.startDate,
    deadline: p.deadline,
    budgetHours: p.budgetHours,
    valuePaise: p.valuePaise,
    totalTasks: c?.total ?? 0,
    doneTasks: c?.done ?? 0,
    openTasks: c?.open ?? 0,
    minutesSpent,
    eta,
  };
}

export async function getProjectDetail(id: string) {
  const [row] = await db
    .select({ p: projects, companyName: companies.name })
    .from(projects)
    .leftJoin(companies, eq(companies.id, projects.companyId))
    .where(eq(projects.id, id));
  if (!row) return null;
  const eta = await getEta();
  const [{ counts, minutes }, ms, taskRows, timeByTask, invoiceRows] = await Promise.all([
    taskStats([id]),
    db.select().from(milestones).where(eq(milestones.projectId, id)).orderBy(asc(milestones.sort), sql`${milestones.dueDate} asc nulls last`),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, id), sql`${tasks.parentTaskId} is null`, sql`${tasks.status} <> 'cancelled'`))
      .orderBy(asc(tasks.priority), sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt)),
    db
      .select({ taskId: tasks.id, title: tasks.title, status: tasks.status, estimate: tasks.estimateMinutes, m: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)::int` })
      .from(timeEntries)
      .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .where(eq(tasks.projectId, id))
      .groupBy(tasks.id, tasks.title, tasks.status, tasks.estimateMinutes)
      .orderBy(desc(sql`sum(${timeEntries.minutes})`)),
    db
      .select({
        id: invoices.id,
        number: invoices.number,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        status: invoices.status,
        totalPaise: invoices.totalPaise,
        paidPaise: invoices.paidPaise,
      })
      .from(invoices)
      .where(eq(invoices.projectId, id))
      .orderBy(desc(invoices.issueDate)),
  ]);
  // Done tasks: only recent ones are shown on the board to keep it light.
  const views = await toViews(taskRows, eta);
  const milestoneProgress = new Map<string, { total: number; done: number }>();
  for (const t of taskRows) {
    if (!t.milestoneId) continue;
    const m = milestoneProgress.get(t.milestoneId) ?? { total: 0, done: 0 };
    m.total++;
    if (t.status === "done") m.done++;
    milestoneProgress.set(t.milestoneId, m);
  }
  return {
    card: toCard(row.p, row.companyName, counts.get(id), minutes.get(id) ?? 0, eta.projects[id] ?? null),
    project: row.p,
    milestones: ms.map((m) => ({ ...m, total: milestoneProgress.get(m.id)?.total ?? 0, done: milestoneProgress.get(m.id)?.done ?? 0 })),
    tasks: views,
    timeByTask: timeByTask.map((t) => ({ ...t, m: Number(t.m) })),
    invoices: invoiceRows,
  };
}

/** Companies to pick as a project's client. */
export async function getCompanyOptions() {
  return db.select({ id: companies.id, name: companies.name, workspace: companies.workspace }).from(companies).orderBy(asc(companies.name)).limit(500);
}
