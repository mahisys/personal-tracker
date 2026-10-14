import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { activityLog, milestones, projects, tasks, timeEntries, type WorkspaceKey } from "@/db/schema";
import { getSettings } from "@/server/settings";
import { istToInstant, addDays, todayIST } from "@/lib/dates";
import type { TaskView } from "@/components/tasks/meta";
import { computeAccuracy, etaFactor, type Accuracy } from "./accuracy";
import { computeEta, type EtaResult, type EtaTask } from "./eta";
import { resolveLinkLabels } from "./links";
import { actualMinutesFor } from "./core";

type TaskRow = typeof tasks.$inferSelect;

export const OPEN_STATUSES = ["todo", "doing", "waiting"] as const;

export type TaskFilters = {
  ws?: WorkspaceKey | null;
  projectId?: string | null;
  priority?: number | null;
  /** Only tasks linked to a record */
  linked?: boolean;
  q?: string | null;
  /** Include subtasks as their own rows (default false: top-level only) */
  includeSubtasks?: boolean;
};

function filterConds(f: TaskFilters): SQL[] {
  const c: SQL[] = [];
  if (f.ws) c.push(eq(tasks.workspace, f.ws));
  if (f.projectId) c.push(eq(tasks.projectId, f.projectId));
  if (f.priority) c.push(eq(tasks.priority, f.priority));
  if (f.linked) c.push(isNotNull(tasks.linkedType));
  if (f.q?.trim()) {
    const term = `%${f.q.trim()}%`;
    c.push(or(ilike(tasks.title, term), ilike(tasks.description, term), sql`array_to_string(${tasks.tags}, ' ') ilike ${term}`)!);
  }
  if (!f.includeSubtasks) c.push(isNull(tasks.parentTaskId));
  return c;
}

/** Enriches task rows with project name, subtask progress, logged time and linked-record labels. */
export async function toViews(rows: TaskRow[], eta?: EtaResult | null): Promise<TaskView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))];
  const [projRows, subRows, actual, labels] = await Promise.all([
    projectIds.length ? db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds)) : [],
    db
      .select({
        parent: tasks.parentTaskId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
      })
      .from(tasks)
      .where(and(inArray(tasks.parentTaskId, ids), sql`${tasks.status} <> 'cancelled'`))
      .groupBy(tasks.parentTaskId),
    actualMinutesFor(ids),
    resolveLinkLabels(rows.map((r) => ({ type: r.linkedType, id: r.linkedId }))),
  ]);
  const projName = new Map(projRows.map((p) => [p.id, p.name]));
  const subs = new Map(subRows.map((s) => [s.parent!, s]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    workspace: r.workspace,
    dueDate: r.dueDate,
    dueTime: r.dueTime,
    estimateMinutes: r.estimateMinutes,
    actualMinutes: actual.get(r.id) ?? 0,
    taskType: r.taskType,
    projectId: r.projectId,
    projectName: r.projectId ? projName.get(r.projectId) ?? null : null,
    parentTaskId: r.parentTaskId,
    linkedType: r.linkedType,
    linkedId: r.linkedId,
    linkedLabel: r.linkedType && r.linkedId ? labels.get(`${r.linkedType}:${r.linkedId}`) ?? null : null,
    tags: r.tags,
    subtaskTotal: subs.get(r.id)?.total ?? 0,
    subtaskDone: subs.get(r.id)?.done ?? 0,
    recurring: !!r.recurrence,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    etaDate: eta?.tasks[r.id]?.finishDate ?? null,
    etaLate: eta?.tasks[r.id]?.late ?? false,
  }));
}

const listOrder = [
  sql`${tasks.dueDate} asc nulls last`,
  sql`${tasks.dueTime} asc nulls last`,
  asc(tasks.priority),
  asc(tasks.sort),
  asc(tasks.createdAt),
];

export async function listOpenTasks(f: TaskFilters, eta?: EtaResult | null): Promise<TaskView[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(inArray(tasks.status, [...OPEN_STATUSES]), ...filterConds(f)))
    .orderBy(...listOrder)
    .limit(1000);
  return toViews(rows, eta);
}

/** Done in the last `days` days, newest first. */
export async function listRecentlyDone(f: TaskFilters, days = 14, limit = 60): Promise<TaskView[]> {
  const since = istToInstant(addDays(todayIST(), -days));
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "done"), gte(tasks.completedAt, since), ...filterConds(f)))
    .orderBy(desc(tasks.completedAt))
    .limit(limit);
  return toViews(rows);
}

export type RunningTimer = { entryId: string; taskId: string; title: string; startedAt: string } | null;

export async function getRunningTimer(): Promise<RunningTimer> {
  const [row] = await db
    .select({ entryId: timeEntries.id, taskId: timeEntries.taskId, title: tasks.title, startedAt: timeEntries.startedAt })
    .from(timeEntries)
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(isNull(timeEntries.endedAt))
    .orderBy(desc(timeEntries.startedAt))
    .limit(1);
  return row ? { ...row, startedAt: row.startedAt.toISOString() } : null;
}

/**
 * Estimate accuracy across completed tasks having both an estimate and logged time.
 * When an estimate was revised, the original (first) estimate is used — that is what you planned.
 */
export const getAccuracy = cache(async (): Promise<Accuracy> => {
  const done = await db
    .select({ id: tasks.id, taskType: tasks.taskType, estimateMinutes: tasks.estimateMinutes })
    .from(tasks)
    .where(and(eq(tasks.status, "done"), isNotNull(tasks.estimateMinutes)))
    .orderBy(desc(tasks.completedAt))
    .limit(500);
  if (done.length === 0) return computeAccuracy([]);
  const ids = done.map((d) => d.id);
  const [actual, revisions] = await Promise.all([
    actualMinutesFor(ids),
    db
      .select({ entityId: activityLog.entityId, details: activityLog.details })
      .from(activityLog)
      .where(and(eq(activityLog.entityType, "task"), eq(activityLog.action, "estimate_revised"), inArray(activityLog.entityId, ids)))
      .orderBy(asc(activityLog.at)),
  ]);
  const original = new Map<string, number>();
  for (const r of revisions) {
    const from = (r.details as { from?: number } | null)?.from;
    if (!original.has(r.entityId) && typeof from === "number" && from > 0) original.set(r.entityId, from);
  }
  return computeAccuracy(
    done.map((d) => ({ taskType: d.taskType, estimateMinutes: original.get(d.id) ?? d.estimateMinutes, actualMinutes: actual.get(d.id) ?? 0 })),
  );
});

/**
 * ETA for every open task and project. Capacity is personal, so all workspaces share one queue.
 * A parent task's own remaining time excludes what its estimated subtasks already cover.
 */
export const getEta = cache(async (): Promise<EtaResult> => {
  const [settings, open, projs, accuracy] = await Promise.all([
    getSettings(),
    db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        parentTaskId: tasks.parentTaskId,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        createdAt: tasks.createdAt,
        estimateMinutes: tasks.estimateMinutes,
      })
      .from(tasks)
      .where(inArray(tasks.status, [...OPEN_STATUSES])),
    db.select({ id: projects.id, deadline: projects.deadline }).from(projects).where(notInArray(projects.status, ["done", "cancelled"])),
    getAccuracy(),
  ]);
  const actual = await actualMinutesFor(open.map((t) => t.id));
  const today = todayIST();
  const usedToday = await minutesLoggedOn(today);
  const remaining = new Map<string, number | null>();
  for (const t of open) remaining.set(t.id, t.estimateMinutes == null ? null : Math.max(t.estimateMinutes - (actual.get(t.id) ?? 0), 0));
  const childCover = new Map<string, number>();
  for (const t of open) {
    const r = remaining.get(t.id);
    if (t.parentTaskId && r != null) childCover.set(t.parentTaskId, (childCover.get(t.parentTaskId) ?? 0) + r);
  }
  const etaTasks: EtaTask[] = open.map((t) => {
    const r = remaining.get(t.id) ?? null;
    const cover = childCover.get(t.id) ?? 0;
    return {
      id: t.id,
      projectId: t.projectId,
      priority: t.priority,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
      remainingMinutes: r == null ? null : Math.max(r - cover, 0),
    };
  });
  return computeEta({
    tasks: etaTasks,
    projects: projs,
    dailyHours: settings.planning.dailyHours,
    workdays: settings.planning.workdays,
    today,
    overrunFactor: etaFactor(accuracy),
    usedTodayMinutes: usedToday,
  });
});

/** Minutes logged (finished entries) that started on an IST day. */
export async function minutesLoggedOn(day: string): Promise<number> {
  const [row] = await db
    .select({ m: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)::int` })
    .from(timeEntries)
    .where(and(gte(timeEntries.startedAt, istToInstant(day)), sql`${timeEntries.startedAt} < ${istToInstant(addDays(day, 1))}`));
  return Number(row?.m ?? 0);
}

export async function getTask(id: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  return row ?? null;
}

export async function getSubtasks(parentId: string): Promise<TaskView[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.parentTaskId, parentId), sql`${tasks.status} <> 'cancelled'`))
    .orderBy(asc(tasks.sort), asc(tasks.createdAt));
  return toViews(rows);
}

export async function getTimeEntries(taskId: string) {
  return db.select().from(timeEntries).where(eq(timeEntries.taskId, taskId)).orderBy(desc(timeEntries.startedAt));
}

export type ProjectOption = { id: string; name: string; workspace: WorkspaceKey; milestones: { id: string; name: string }[] };

/** Projects (not finished) with their open milestones, for task forms. */
export async function getProjectOptions(includeId?: string | null): Promise<ProjectOption[]> {
  const projs = await db
    .select({ id: projects.id, name: projects.name, workspace: projects.workspace, status: projects.status })
    .from(projects)
    .orderBy(asc(projects.name));
  const visible = projs.filter((p) => !["done", "cancelled"].includes(p.status) || p.id === includeId);
  const ms = visible.length
    ? await db
        .select({ id: milestones.id, name: milestones.name, projectId: milestones.projectId })
        .from(milestones)
        .where(inArray(milestones.projectId, visible.map((p) => p.id)))
        .orderBy(asc(milestones.sort), asc(milestones.dueDate))
    : [];
  return visible.map((p) => ({ id: p.id, name: p.name, workspace: p.workspace, milestones: ms.filter((m) => m.projectId === p.id).map((m) => ({ id: m.id, name: m.name })) }));
}

/** Distinct task types used so far, plus the defaults, for the type suggestions list. */
export async function getTaskTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ t: sql<string>`lower(trim(${tasks.taskType}))` })
    .from(tasks)
    .where(isNotNull(tasks.taskType))
    .limit(50);
  return rows.map((r) => r.t).filter(Boolean);
}
