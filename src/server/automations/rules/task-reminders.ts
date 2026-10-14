import "server-only";
import { and, gt, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { tasks, type WorkspaceKey } from "@/db/schema";
import { formatDay, relativeDay } from "@/lib/dates";
import { raiseOnce } from "../helpers";
import { OPEN_TASK_STATUSES, type Rule } from "../types";

export type TaskReminderLite = {
  id: string;
  title: string;
  status: string;
  remindAt: Date | null;
  dueDate: string | null;
  dueTime: string | null;
  workspace: WorkspaceKey;
};

/** A reminder fires once its remindAt has passed (within the last 24 hours) for an open task. */
export function decideTaskReminder(
  t: TaskReminderLite,
  now: Date,
  today: string,
): { dedupeKey: string; title: string; body: string } | null {
  if (!t.remindAt || !(OPEN_TASK_STATUSES as readonly string[]).includes(t.status)) return null;
  const at = t.remindAt.getTime();
  if (at > now.getTime() || at <= now.getTime() - 24 * 3600_000) return null;
  const body = t.dueDate
    ? `Due ${relativeDay(t.dueDate, today).toLowerCase()} (${formatDay(t.dueDate, { short: true })})${t.dueTime ? ` at ${t.dueTime}` : ""}`
    : "Reminder";
  return { dedupeKey: `task_reminder:${t.id}:${t.remindAt.toISOString()}`, title: t.title, body };
}

export const taskReminders: Rule = {
  key: "task_reminders",
  async run({ now, today }) {
    const rows = await db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, remindAt: tasks.remindAt, dueDate: tasks.dueDate, dueTime: tasks.dueTime, workspace: tasks.workspace })
      .from(tasks)
      .where(and(inArray(tasks.status, [...OPEN_TASK_STATUSES]), lte(tasks.remindAt, now), gt(tasks.remindAt, new Date(now.getTime() - 24 * 3600_000))));
    let n = 0;
    for (const t of rows) {
      const r = decideTaskReminder(t, now, today);
      if (r && (await raiseOnce({ kind: "task_reminder", ...r, link: `/tasks/${t.id}`, workspace: t.workspace }))) n++;
    }
    return { notifications: n, note: `${rows.length} reminders due` };
  },
};
