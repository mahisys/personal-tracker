import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { activityLog } from "@/db/schema";

/** Adds a line to a record's history ("Stage changed to Sanctioned", "Payment of ₹5,000 recorded"). */
export async function logActivity(
  entityType: string,
  entityId: string,
  action: string,
  summary: string,
  details?: unknown,
  conn: DbOrTx = db,
) {
  await conn.insert(activityLog).values({ entityType, entityId, action, summary, details: details ?? null });
}

export async function getHistory(entityType: string, entityId: string, limit = 50) {
  return db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.entityType, entityType), eq(activityLog.entityId, entityId)))
    .orderBy(desc(activityLog.at))
    .limit(limit);
}
