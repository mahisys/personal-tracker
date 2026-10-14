import "server-only";
import { and, eq, gte, inArray, isNull, lt, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks, type WorkspaceKey } from "@/db/schema";
import { addDays, diffDays, istToInstant } from "@/lib/dates";
import type { ComingUpItem, NeedsItem } from "./types";

const OPEN = ["todo", "doing", "waiting"] as const;
const wsCond = (ws: WorkspaceKey | null): SQL | undefined => (ws ? eq(tasks.workspace, ws) : undefined);

function dueLine(dueDate: string, dueTime: string | null, today: string): string {
  const n = diffDays(dueDate, today);
  if (n > 0) return n === 1 ? "Overdue since yesterday" : `Overdue by ${n} days`;
  return dueTime ? `Due today at ${formatTime(dueTime)}` : "Due today";
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** Open tasks (including steps) due today or overdue. */
export async function tasksNeedingYou(ws: WorkspaceKey | null, today: string): Promise<NeedsItem[]> {
  const rows = await db
    .select({ t: tasks, projectName: projects.name })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(inArray(tasks.status, [...OPEN]), lte(tasks.dueDate, today), wsCond(ws)))
    .orderBy(tasks.dueDate, sql`${tasks.dueTime} asc nulls last`, tasks.priority);
  return rows.map(({ t, projectName }) => ({
    key: `task:${t.id}`,
    kind: "task",
    id: t.id,
    title: t.title,
    context: [dueLine(t.dueDate!, t.dueTime, today), projectName, t.status === "waiting" ? "Waiting" : null].filter(Boolean).join(" · "),
    workspace: t.workspace,
    href: `/tasks/${t.id}`,
    date: t.dueDate,
    overdue: t.dueDate! < today,
    priority: t.priority,
    dueTime: t.dueTime,
    estimateMinutes: t.estimateMinutes,
    recurring: !!t.recurrence,
  }));
}

/** Top-level tasks completed on an IST day. */
export async function tasksDoneOn(ws: WorkspaceKey | null, day: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(eq(tasks.status, "done"), isNull(tasks.parentTaskId), gte(tasks.completedAt, istToInstant(day)), lt(tasks.completedAt, istToInstant(addDays(day, 1))), wsCond(ws)),
    );
  return r?.n ?? 0;
}

/** Top-level open tasks due today or earlier, and their remaining estimated minutes. */
export async function plateToday(ws: WorkspaceKey | null, today: string) {
  const rows = await db
    .select({
      id: tasks.id,
      dueDate: tasks.dueDate,
      estimate: tasks.estimateMinutes,
      logged: sql<number>`(select coalesce(sum(minutes), 0)::int from time_entries te where te.task_id = ${tasks.id})`,
    })
    .from(tasks)
    .where(and(inArray(tasks.status, [...OPEN]), isNull(tasks.parentTaskId), lte(tasks.dueDate, today), wsCond(ws)));
  let remaining = 0;
  let unestimated = 0;
  for (const r of rows) {
    if (r.estimate == null) unestimated++;
    else remaining += Math.max(r.estimate - Number(r.logged), 0);
  }
  return { count: rows.length, dueTodayCount: rows.filter((r) => r.dueDate === today).length, remainingMinutes: remaining, unestimated };
}

/** IST days (last ~13 months) with at least one completed task. */
export async function completionDays(ws: WorkspaceKey | null, today: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ d: sql<string>`to_char(${tasks.completedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')` })
    .from(tasks)
    .where(and(eq(tasks.status, "done"), gte(tasks.completedAt, istToInstant(addDays(today, -400))), wsCond(ws)));
  return rows.map((r) => r.d);
}

export async function tasksComingUp(ws: WorkspaceKey | null, from: string, to: string): Promise<ComingUpItem[]> {
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, dueTime: tasks.dueTime, workspace: tasks.workspace, projectName: projects.name })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(inArray(tasks.status, [...OPEN]), gte(tasks.dueDate, from), lte(tasks.dueDate, to), wsCond(ws)))
    .orderBy(tasks.dueDate, sql`${tasks.dueTime} asc nulls last`, tasks.priority)
    .limit(60);
  return rows.map((r) => ({
    key: `task:${r.id}`,
    kind: "task",
    title: r.title,
    sub: [r.dueTime ? formatTime(r.dueTime) : null, r.projectName].filter(Boolean).join(" · ") || null,
    href: `/tasks/${r.id}`,
    date: r.dueDate!,
    workspace: r.workspace,
  }));
}
