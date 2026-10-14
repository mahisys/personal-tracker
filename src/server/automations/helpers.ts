import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { tasks, type LinkedEntityType, type WorkspaceKey } from "@/db/schema";
import { createNotification, type NewNotification } from "@/server/notify";
import { logActivity } from "@/server/activity";
import { OPEN_TASK_STATUSES } from "./types";

/** Raises a notification once (by dedupeKey). Returns true when it was new. */
export async function raiseOnce(n: NewNotification & { dedupeKey: string }, conn: DbOrTx = db): Promise<boolean> {
  const row = await createNotification(n, conn);
  return row != null;
}

/**
 * Raises a notification and creates a task in one transaction — the task is only created when the
 * notification is new, so a rule can never create the same task twice for the same dedupe key.
 */
export async function raiseWithTask(n: NewNotification & { dedupeKey: string }, task: AutoTask | null): Promise<{ raised: boolean; taskId: string | null }> {
  return db.transaction(async (tx) => {
    const raised = await raiseOnce(n, tx);
    if (!raised || !task) return { raised, taskId: null };
    const row = await createAutoTask(task, tx);
    return { raised, taskId: row.id };
  });
}

/** Is there an open task linked to this record? Optionally only tasks whose title starts with a prefix. */
export async function hasOpenLinkedTask(linkedType: LinkedEntityType, linkedId: string, titlePrefix?: string): Promise<boolean> {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.linkedType, linkedType),
        eq(tasks.linkedId, linkedId),
        inArray(tasks.status, [...OPEN_TASK_STATUSES]),
        titlePrefix ? sql`${tasks.title} like ${titlePrefix + "%"}` : undefined,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Is there an open task carrying this tag (used for records that tasks cannot link to, e.g. renewals)? */
export async function hasOpenTaggedTask(tag: string): Promise<boolean> {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(sql`${tag} = any(${tasks.tags})`, inArray(tasks.status, [...OPEN_TASK_STATUSES])))
    .limit(1);
  return rows.length > 0;
}

export type AutoTask = {
  workspace: WorkspaceKey;
  title: string;
  description?: string;
  dueDate: string;
  priority?: number;
  linkedType?: LinkedEntityType | null;
  linkedId?: string | null;
  tags?: string[];
  taskType?: string | null;
};

export async function createAutoTask(t: AutoTask, conn: DbOrTx = db) {
  const [row] = await conn
    .insert(tasks)
    .values({
      workspace: t.workspace,
      title: t.title,
      description: t.description ?? "",
      dueDate: t.dueDate,
      priority: t.priority ?? 2,
      linkedType: t.linkedType ?? null,
      linkedId: t.linkedId ?? null,
      tags: ["auto", ...(t.tags ?? [])],
      taskType: t.taskType ?? null,
    })
    .returning();
  await logActivity("task", row.id, "created", "Created by an automation", null, conn);
  return row;
}

/** App base URL for links in emails. */
export function appUrl(path = "/"): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
