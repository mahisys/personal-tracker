import "server-only";
import { db, type DbOrTx } from "@/db";
import { notifications, type WorkspaceKey } from "@/db/schema";

export type NewNotification = {
  kind: string;
  title: string;
  body?: string;
  link?: string;
  workspace?: WorkspaceKey | null;
  /** When set, the same alert is never created twice. */
  dedupeKey?: string;
};

/**
 * Records an in-app notification. Returns the new row, or null when the dedupeKey already exists.
 * Push delivery is handled by the automation engine (src/server/automations), which sends unpushed rows.
 */
export async function createNotification(n: NewNotification, conn: DbOrTx = db) {
  const rows = await conn
    .insert(notifications)
    .values({
      kind: n.kind,
      title: n.title,
      body: n.body ?? "",
      link: n.link ?? null,
      workspace: n.workspace ?? null,
      dedupeKey: n.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning();
  return rows[0] ?? null;
}
