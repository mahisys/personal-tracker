import "server-only";
import { and, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { tasks, timeEntries } from "@/db/schema";
import { logActivity } from "@/server/activity";
import { addDays, diffDays, formatDay, formatMinutes, todayIST } from "@/lib/dates";
import { nextOccurrence } from "@/lib/recurrence";

type TaskRow = typeof tasks.$inferSelect;

export type Overrun = { taskId: string; title: string; estimateMinutes: number; actualMinutes: number; seriesOpen: boolean };

/** Logged minutes per task (finished entries only). */
export async function actualMinutesFor(ids: string[], conn: DbOrTx = db): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const rows = await conn
    .select({ taskId: timeEntries.taskId, m: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)::int` })
    .from(timeEntries)
    .where(inArray(timeEntries.taskId, ids))
    .groupBy(timeEntries.taskId);
  for (const r of rows) out.set(r.taskId, Number(r.m));
  return out;
}

/**
 * The next due date of a recurring task. Starts from the task's due date (or today if it has none)
 * and keeps the series' anchor day of month; occurrences already in the past are skipped so a
 * long-overdue daily task does not spawn a backlog.
 */
export function nextDueDate(task: Pick<TaskRow, "recurrence" | "dueDate">, anchorDay: number | undefined, today: string): string | null {
  if (!task.recurrence) return null;
  const from = task.dueDate ?? today;
  let next = nextOccurrence(task.recurrence, from, anchorDay);
  let guard = 0;
  while (next && next < today && guard++ < 1000) next = nextOccurrence(task.recurrence, next, anchorDay);
  return next;
}

export type CompleteResult = { task: TaskRow; next: TaskRow | null; overrun: Overrun | null; already: boolean };

/**
 * Marks a task done. For a recurring task the next instance (same series, anchor day kept,
 * subtasks copied fresh) is created in the same transaction. History is logged on both.
 */
export async function completeTaskCore(id: string, opts: { now?: Date; today?: string } = {}): Promise<CompleteResult | null> {
  const now = opts.now ?? new Date();
  const today = opts.today ?? todayIST(now);
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update");
    if (!task) return null;
    if (task.status === "done") return { task, next: null, overrun: null, already: true };

    const [updated] = await tx.update(tasks).set({ status: "done", completedAt: now }).where(eq(tasks.id, id)).returning();
    await logActivity("task", id, "completed", "Marked done", null, tx);

    let next: TaskRow | null = null;
    if (task.recurrence) {
      const seriesId = task.seriesId ?? task.id;
      let anchorSource = task.dueDate;
      if (task.seriesId) {
        const [first] = await tx.select({ dueDate: tasks.dueDate }).from(tasks).where(eq(tasks.id, task.seriesId));
        anchorSource = first?.dueDate ?? task.dueDate;
      }
      const anchorDay = anchorSource ? Number(anchorSource.slice(8, 10)) : undefined;
      const nextDue = nextDueDate(task, anchorDay, today);
      if (nextDue) {
        // Never create a duplicate (e.g. when a task is un-ticked and ticked again).
        const [existing] = await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.seriesId, seriesId), eq(tasks.dueDate, nextDue), ne(tasks.id, task.id), notInArray(tasks.status, ["done", "cancelled"])));
        if (!existing) {
          const shift = task.dueDate ? diffDays(task.dueDate, nextDue) : null;
          [next] = await tx
            .insert(tasks)
            .values({
              workspace: task.workspace,
              projectId: task.projectId,
              milestoneId: task.milestoneId,
              parentTaskId: task.parentTaskId,
              title: task.title,
              description: task.description,
              status: "todo",
              priority: task.priority,
              taskType: task.taskType,
              dueDate: nextDue,
              dueTime: task.dueTime,
              remindAt: task.remindAt && shift != null ? new Date(task.remindAt.getTime() + shift * 86_400_000) : null,
              estimateMinutes: task.estimateMinutes,
              recurrence: task.recurrence,
              seriesId,
              linkedType: task.linkedType,
              linkedId: task.linkedId,
              sort: task.sort,
              tags: task.tags,
            })
            .returning();
          const subtasks = await tx
            .select()
            .from(tasks)
            .where(and(eq(tasks.parentTaskId, task.id), ne(tasks.status, "cancelled")));
          if (subtasks.length) {
            await tx.insert(tasks).values(
              subtasks.map((s) => ({
                workspace: s.workspace,
                projectId: s.projectId,
                parentTaskId: next!.id,
                title: s.title,
                priority: s.priority,
                taskType: s.taskType,
                estimateMinutes: s.estimateMinutes,
                sort: s.sort,
                tags: s.tags,
              })),
            );
          }
          await logActivity("task", next.id, "created", `Repeats — next one after ${formatDay(task.dueDate ?? today)}`, { from: task.id }, tx);
          await logActivity("task", id, "recurred", `Next one scheduled for ${formatDay(nextDue)}`, { next: next.id }, tx);
        }
      }
    }

    const actual = (await actualMinutesFor([id], tx)).get(id) ?? 0;
    const overrun =
      task.estimateMinutes && actual > task.estimateMinutes
        ? { taskId: id, title: task.title, estimateMinutes: task.estimateMinutes, actualMinutes: actual, seriesOpen: !!next }
        : null;
    return { task: updated, next, overrun, already: false };
  });
}

/** Re-opens a completed task. */
export async function reopenTaskCore(id: string) {
  const [row] = await db.update(tasks).set({ status: "todo", completedAt: null }).where(eq(tasks.id, id)).returning();
  if (row) await logActivity("task", id, "reopened", "Re-opened");
  return row ?? null;
}

/** Moves the due date to tomorrow (IST). */
export async function snoozeTaskCore(id: string, today: string = todayIST()) {
  const tomorrow = addDays(today, 1);
  const [row] = await db.update(tasks).set({ dueDate: tomorrow }).where(eq(tasks.id, id)).returning();
  if (row) await logActivity("task", id, "snoozed", "Snoozed to tomorrow");
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Timers — at most one running across the whole app
// ---------------------------------------------------------------------------

export type StopResult = { entryId: string; taskId: string; minutes: number; discarded: boolean; overrun: Overrun | null } | null;

async function stopRunning(tx: DbOrTx, now: Date): Promise<StopResult> {
  const [running] = await tx.select().from(timeEntries).where(isNull(timeEntries.endedAt)).limit(1);
  if (!running) return null;
  const minutes = Math.round((now.getTime() - running.startedAt.getTime()) / 60_000);
  if (minutes < 1) {
    await tx.delete(timeEntries).where(eq(timeEntries.id, running.id));
    return { entryId: running.id, taskId: running.taskId, minutes: 0, discarded: true, overrun: null };
  }
  await tx.update(timeEntries).set({ endedAt: now, minutes }).where(eq(timeEntries.id, running.id));
  await logActivity("task", running.taskId, "time_logged", `Logged ${formatMinutes(minutes)} with the timer`, { entryId: running.id }, tx);
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, running.taskId));
  const actual = (await actualMinutesFor([running.taskId], tx)).get(running.taskId) ?? 0;
  const overrun =
    task?.estimateMinutes && actual > task.estimateMinutes
      ? { taskId: task.id, title: task.title, estimateMinutes: task.estimateMinutes, actualMinutes: actual, seriesOpen: false }
      : null;
  return { entryId: running.id, taskId: running.taskId, minutes, discarded: false, overrun };
}

export async function stopTimerCore(now: Date = new Date()): Promise<StopResult> {
  return db.transaction((tx) => stopRunning(tx, now));
}

/** Starts a timer on a task, stopping any other running timer first. Moves a to-do task to "doing". */
export async function startTimerCore(taskId: string, now: Date = new Date()) {
  return db.transaction(async (tx) => {
    const stopped = await stopRunning(tx, now);
    const [entry] = await tx.insert(timeEntries).values({ taskId, startedAt: now }).returning();
    await tx.update(tasks).set({ status: "doing" }).where(and(eq(tasks.id, taskId), eq(tasks.status, "todo")));
    return { entry, stopped };
  });
}
