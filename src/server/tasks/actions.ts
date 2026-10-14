"use server";
import { and, eq, isNull, ne, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { projects, tasks, TASK_STATUSES, timeEntries, type TaskStatus } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import { parseWorkspace } from "@/server/workspace";
import { day, done, fail, int, str, type ActionResult } from "@/lib/action";
import { formatDay, formatMinutes, fromDateTimeLocalIST, istToInstant, todayIST } from "@/lib/dates";
import { recurrenceFromForm } from "@/lib/recurrence";
import { completeTaskCore, reopenTaskCore, snoozeTaskCore, startTimerCore, stopTimerCore, type Overrun } from "./core";
import { fetchTargets, isLinkedType, type LinkTarget } from "./links";

/** Result for actions called directly from client components (not via <ActionForm>). */
export type TaskActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  celebrate?: boolean;
  /** Set when logged time has gone past the estimate — the UI offers to revise it */
  overrun?: Overrun | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | null | undefined): v is string => !!v && UUID.test(v);

function revalidateTaskPages(...extra: (string | null | undefined)[]) {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
  for (const p of extra) if (p) revalidatePath(p);
}

/** Reads "estH"/"estM" (or a given prefix) into minutes; null when both are blank. */
function minutesFromForm(form: FormData, prefix = "est"): number | null | "invalid" {
  const h = str(form, `${prefix}H`);
  const m = str(form, `${prefix}M`);
  if (h == null && m == null) return null;
  const hn = Number(h ?? 0);
  const mn = Number(m ?? 0);
  if (!Number.isFinite(hn) || !Number.isFinite(mn) || hn < 0 || mn < 0) return "invalid";
  const total = Math.round(hn * 60 + mn);
  return total > 0 ? total : null;
}

function tagsFromForm(form: FormData): string[] {
  const raw = str(form, "tags") ?? "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw.split(",")) {
    const s = t.trim().replace(/^#/, "");
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out.slice(0, 12);
}

// ---------------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------------

export async function saveTask(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const title = str(form, "title");
  if (!title) return fail("Give the task a title");
  if (title.length > 300) return fail("That title is a bit long — keep it under 300 characters");

  const estimate = minutesFromForm(form);
  if (estimate === "invalid") return fail("The estimate should be hours and minutes, like 1 h 30 m");

  const priority = int(form, "priority") ?? 3;
  if (priority < 1 || priority > 4) return fail("Priority must be P1 to P4");

  const statusRaw = str(form, "status");
  const status = statusRaw && (TASK_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as TaskStatus) : undefined;

  const dueTime = str(form, "dueTime");
  if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) return fail("Due time should look like 14:30");

  const projectId = str(form, "projectId");
  let workspace = parseWorkspace(form.get("workspace"));
  if (projectId) {
    if (!isUuid(projectId)) return fail("Pick a valid project");
    const [p] = await db.select({ workspace: projects.workspace }).from(projects).where(eq(projects.id, projectId));
    if (!p) return fail("That project no longer exists");
    workspace = p.workspace;
  }
  const milestoneId = projectId ? str(form, "milestoneId") : null;

  const linkedTypeRaw = str(form, "linkedType");
  const linkedIdRaw = str(form, "linkedId");
  const linkedType = isLinkedType(linkedTypeRaw) && isUuid(linkedIdRaw) ? linkedTypeRaw : null;
  const linkedId = linkedType ? linkedIdRaw : null;

  const recurrence = recurrenceFromForm(form);
  let dueDate = day(form, "dueDate");
  if (recurrence && !dueDate) dueDate = todayIST();
  if (recurrence?.until && dueDate && recurrence.until < dueDate) return fail("The repeat-until date is before the due date");

  const values = {
    title,
    description: str(form, "description") ?? "",
    priority,
    taskType: str(form, "taskType")?.toLowerCase() ?? null,
    dueDate,
    dueTime: dueDate ? dueTime : null,
    remindAt: fromDateTimeLocalIST(str(form, "remindAt")),
    estimateMinutes: estimate,
    recurrence,
    projectId,
    milestoneId: milestoneId && isUuid(milestoneId) ? milestoneId : null,
    linkedType,
    linkedId,
    tags: tagsFromForm(form),
    workspace,
  };

  if (id) {
    if (!isUuid(id)) return fail("Task not found");
    const [before] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!before) return fail("Task not found");
    const nextStatus = status ?? before.status;
    const becameDone = nextStatus === "done" && before.status !== "done";
    const reopened = before.status === "done" && nextStatus !== "done";
    await db
      .update(tasks)
      .set({ ...values, status: becameDone ? before.status : nextStatus, completedAt: reopened ? null : before.completedAt })
      .where(eq(tasks.id, id));
    const changed: string[] = [];
    if (before.title !== values.title) changed.push("title");
    if (before.dueDate !== values.dueDate) changed.push(values.dueDate ? `due date → ${formatDay(values.dueDate, { short: true })}` : "due date removed");
    if (before.priority !== values.priority) changed.push(`priority → P${values.priority}`);
    if (before.estimateMinutes !== values.estimateMinutes) changed.push(`estimate → ${formatMinutes(values.estimateMinutes)}`);
    if (before.projectId !== values.projectId) changed.push("project");
    if (before.status !== nextStatus && !becameDone) changed.push(`status → ${nextStatus}`);
    if (before.description !== values.description) changed.push("notes");
    if (JSON.stringify(before.recurrence) !== JSON.stringify(values.recurrence)) changed.push("repeat");
    if (before.linkedId !== values.linkedId) changed.push("linked record");
    if (changed.length) await logActivity("task", id, "updated", `Updated ${changed.join(", ")}`);
    if (becameDone) {
      const r = await completeTaskCore(id);
      revalidateTaskPages(`/tasks/${id}`, projectId && `/projects/${projectId}`, before.projectId && `/projects/${before.projectId}`);
      return done(r?.next ? `Done! Next one is on ${formatDay(r.next.dueDate, { short: true })}` : "Saved and done — nice work", { celebrate: true });
    }
    revalidateTaskPages(`/tasks/${id}`, projectId && `/projects/${projectId}`, before.projectId && `/projects/${before.projectId}`);
    return done("Task saved");
  }

  const parentTaskId = str(form, "parentTaskId");
  const [row] = await db
    .insert(tasks)
    .values({ ...values, status: status && status !== "done" ? status : "todo", parentTaskId: isUuid(parentTaskId) ? parentTaskId : null })
    .returning();
  await logActivity("task", row.id, "created", "Task created");
  revalidateTaskPages(projectId && `/projects/${projectId}`);
  const when = !row.dueDate ? "" : row.dueDate === todayIST() ? " for today" : ` for ${formatDay(row.dueDate, { short: true })}`;
  return done(`Added${when} — you've got this`);
}

export async function deleteTask(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!isUuid(id)) return fail("Task not found");
  const [row] = await db.select({ projectId: tasks.projectId, parentTaskId: tasks.parentTaskId }).from(tasks).where(eq(tasks.id, id));
  if (!row) return fail("Task not found");
  await db.transaction(async (tx) => {
    await tx.delete(tasks).where(eq(tasks.parentTaskId, id));
    await tx.delete(tasks).where(eq(tasks.id, id));
  });
  revalidateTaskPages(row.projectId && `/projects/${row.projectId}`, row.parentTaskId && `/tasks/${row.parentTaskId}`);
  const back = str(form, "redirectTo");
  // Leave the deleted task's page with a real redirect (its own page would 404 on refresh).
  if (back && back.startsWith("/") && !back.startsWith("//")) redirect(back);
  return done("Task deleted");
}

export async function addSubtask(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const parentId = str(form, "parentId");
  const title = str(form, "title");
  if (!isUuid(parentId)) return fail("Task not found");
  if (!title) return fail("Type a step first");
  const [parent] = await db.select().from(tasks).where(eq(tasks.id, parentId));
  if (!parent) return fail("Task not found");
  const estimate = minutesFromForm(form);
  await db.insert(tasks).values({
    workspace: parent.workspace,
    projectId: parent.projectId,
    milestoneId: parent.milestoneId,
    parentTaskId: parent.id,
    title,
    priority: parent.priority,
    taskType: parent.taskType,
    estimateMinutes: estimate === "invalid" ? null : estimate,
    sort: Date.now() % 1_000_000_000,
  });
  await logActivity("task", parent.id, "subtask_added", `Added step “${title}”`);
  revalidateTaskPages(`/tasks/${parent.id}`);
  return done("Step added");
}

// ---------------------------------------------------------------------------
// One-tap actions (called directly from client components)
// ---------------------------------------------------------------------------

export async function toggleTaskDone(id: string, makeDone: boolean): Promise<TaskActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Task not found" };
  if (!makeDone) {
    const row = await reopenTaskCore(id);
    if (!row) return { ok: false, error: "Task not found" };
    revalidateTaskPages(`/tasks/${id}`, row.parentTaskId && `/tasks/${row.parentTaskId}`, row.projectId && `/projects/${row.projectId}`);
    return { ok: true, message: "Back on your list" };
  }
  const r = await completeTaskCore(id);
  if (!r) return { ok: false, error: "Task not found" };
  revalidateTaskPages(`/tasks/${id}`, r.task.parentTaskId && `/tasks/${r.task.parentTaskId}`, r.task.projectId && `/projects/${r.task.projectId}`, r.next && `/tasks/${r.next.id}`);
  if (r.already) return { ok: true };
  const isStep = !!r.task.parentTaskId;
  return {
    ok: true,
    celebrate: !isStep,
    message: r.next ? `Done! Next one is on ${formatDay(r.next.dueDate, { short: true })}` : isStep ? "Step done" : pickCheer(),
    overrun: r.overrun,
  };
}

const CHEERS = ["Done — nice work!", "Ticked off. Lovely.", "One less thing. Well done!", "Boom — done.", "Great job, that's done."];
function pickCheer() {
  return CHEERS[Math.floor(Math.random() * CHEERS.length)];
}

export async function snoozeTask(id: string): Promise<TaskActionResult> {
  await requireUser();
  if (!isUuid(id)) return { ok: false, error: "Task not found" };
  const row = await snoozeTaskCore(id);
  if (!row) return { ok: false, error: "Task not found" };
  revalidateTaskPages(`/tasks/${id}`);
  return { ok: true, message: "Moved to tomorrow — rest easy" };
}

/** Board drag-and-drop / "Move to" menu. Moving into Done completes the task (recurrence included). */
export async function moveTask(id: string, status: TaskStatus): Promise<TaskActionResult> {
  await requireUser();
  if (!isUuid(id) || !(TASK_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Can't move that task" };
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!row) return { ok: false, error: "Task not found" };
  if (row.status === status) return { ok: true };
  if (status === "done") return toggleTaskDone(id, true);
  await db
    .update(tasks)
    .set({ status, completedAt: status === "cancelled" ? row.completedAt : null })
    .where(eq(tasks.id, id));
  await logActivity("task", id, "status", `Moved to ${status === "todo" ? "To do" : status[0].toUpperCase() + status.slice(1)}`);
  revalidateTaskPages(`/tasks/${id}`, row.projectId && `/projects/${row.projectId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Time tracking
// ---------------------------------------------------------------------------

export async function startTimer(taskId: string): Promise<TaskActionResult> {
  await requireUser();
  if (!isUuid(taskId)) return { ok: false, error: "Task not found" };
  const [task] = await db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(eq(tasks.id, taskId));
  if (!task) return { ok: false, error: "Task not found" };
  const { stopped } = await startTimerCore(taskId);
  revalidateTaskPages(`/tasks/${taskId}`, stopped && `/tasks/${stopped.taskId}`);
  return {
    ok: true,
    message: stopped && !stopped.discarded ? `Switched — logged ${formatMinutes(stopped.minutes)} on the previous task` : "Timer started — focus mode on",
    overrun: stopped?.overrun ?? null,
  };
}

export async function stopTimer(): Promise<TaskActionResult> {
  await requireUser();
  const r = await stopTimerCore();
  if (!r) return { ok: true, message: "No timer was running" };
  revalidateTaskPages(`/tasks/${r.taskId}`);
  if (r.discarded) return { ok: true, message: "Under a minute — not logged" };
  return { ok: true, message: `Logged ${formatMinutes(r.minutes)} — nice focus`, overrun: r.overrun };
}

export async function addTimeEntry(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const taskId = str(form, "taskId");
  if (!isUuid(taskId)) return fail("Task not found");
  const minutes = minutesFromForm(form, "time");
  if (minutes === "invalid" || minutes == null) return fail("Enter the time spent, like 0 h 45 m");
  if (minutes > 24 * 60) return fail("That's more than a day — split it into separate entries");
  const date = day(form, "date") ?? todayIST();
  if (date > todayIST()) return fail("You can't log time in the future");
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId));
  if (!task) return fail("Task not found");
  const startedAt = istToInstant(date, "09:00");
  await db.insert(timeEntries).values({ taskId, startedAt, endedAt: new Date(startedAt.getTime() + minutes * 60_000), minutes, note: str(form, "note") ?? "" });
  await logActivity("task", taskId, "time_logged", `Logged ${formatMinutes(minutes)} for ${formatDay(date, { short: true })}`);
  revalidateTaskPages(`/tasks/${taskId}`);
  return done(`Logged ${formatMinutes(minutes)}`);
}

export async function deleteTimeEntry(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!isUuid(id)) return fail("Entry not found");
  const [row] = await db.delete(timeEntries).where(eq(timeEntries.id, id)).returning();
  if (!row) return fail("Entry not found");
  await logActivity("task", row.taskId, "time_removed", `Removed a ${formatMinutes(row.minutes)} time entry`);
  revalidateTaskPages(`/tasks/${row.taskId}`);
  return done("Time entry removed");
}

/**
 * Revises an estimate after an overrun. The original estimate is kept in history (used for
 * accuracy stats). With applyToSeries, open future instances of a recurring task update too.
 */
export async function reviseEstimate(taskId: string, minutes: number, applyToSeries = true): Promise<TaskActionResult> {
  await requireUser();
  if (!isUuid(taskId)) return { ok: false, error: "Task not found" };
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 100 * 60) return { ok: false, error: "Enter a sensible estimate" };
  const m = Math.round(minutes);
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return { ok: false, error: "Task not found" };
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ estimateMinutes: m }).where(eq(tasks.id, taskId));
    await logActivity(
      "task",
      taskId,
      "estimate_revised",
      `Estimate revised from ${formatMinutes(task.estimateMinutes)} to ${formatMinutes(m)}`,
      { from: task.estimateMinutes, to: m },
      tx,
    );
    if (applyToSeries && task.recurrence) {
      const seriesId = task.seriesId ?? task.id;
      await tx
        .update(tasks)
        .set({ estimateMinutes: m })
        .where(and(eq(tasks.seriesId, seriesId), ne(tasks.id, taskId), notInArray(tasks.status, ["done", "cancelled"]), isNull(tasks.parentTaskId)));
    }
  });
  revalidateTaskPages(`/tasks/${taskId}`);
  return { ok: true, message: `Estimate updated to ${formatMinutes(m)} — future ETAs just got smarter` };
}

// ---------------------------------------------------------------------------
// Linking
// ---------------------------------------------------------------------------

export async function searchLinkTargets(type: string, q: string): Promise<LinkTarget[]> {
  await requireUser();
  if (!isLinkedType(type)) return [];
  return fetchTargets(type, { search: q.slice(0, 80) });
}
