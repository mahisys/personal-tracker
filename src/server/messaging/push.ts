import "server-only";
import { and, asc, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications, pushTokens } from "@/db/schema";
import { getAdminMessaging } from "@/server/firebase-admin";

export type PushPayload = { title: string; body: string; link?: string | null; tag?: string | null };
export type PushResult = { sent: number; failed: number; removed: number; skipped?: string; error?: string };

/** Error codes meaning the token will never work again. */
const DEAD_TOKEN_CODES = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

export function pushConfigured(): boolean {
  return Boolean(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT);
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Sends a data-only message to every registered device (the service worker renders it). */
export async function sendPush(p: PushPayload): Promise<PushResult> {
  const rows = await db.select({ token: pushTokens.token }).from(pushTokens);
  if (!rows.length) return { sent: 0, failed: 0, removed: 0, skipped: "No devices registered" };
  if (!pushConfigured()) return { sent: 0, failed: 0, removed: 0, skipped: "Firebase is not configured" };
  const data = { title: clip(p.title, 120), body: clip(p.body, 600), link: p.link || "/notifications", tag: p.tag || "cc" };
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  const tokens = rows.map((r) => r.token);
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await getAdminMessaging().sendEachForMulticast({ tokens: batch, data, webpush: { headers: { Urgency: "high", TTL: "86400" } } });
    sent += res.successCount;
    failed += res.failureCount;
    res.responses.forEach((r, j) => {
      if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.push(batch[j]);
    });
  }
  if (dead.length) await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
  return { sent, failed, removed: dead.length };
}

/** Pure: how a batch of new alerts becomes pushes — individually when few, otherwise one summary. */
export function planPushes(rows: { id: string; kind: string; title: string; body: string; link: string | null }[], max = 3): PushPayload[] {
  if (rows.length === 0) return [];
  if (rows.length <= max) return rows.map((r) => ({ title: r.title, body: r.body, link: r.link, tag: `${r.kind}:${r.id}` }));
  // The digest / weekly review stand on their own; everything else is summarised.
  const special = rows.filter((r) => r.kind === "digest" || r.kind === "weekly_review");
  const rest = rows.filter((r) => r.kind !== "digest" && r.kind !== "weekly_review");
  const out: PushPayload[] = special.map((r) => ({ title: r.title, body: r.body, link: r.link, tag: `${r.kind}:${r.id}` }));
  if (rest.length === 1) out.push({ title: rest[0].title, body: rest[0].body, link: rest[0].link, tag: `${rest[0].kind}:${rest[0].id}` });
  else if (rest.length > 1)
    out.push({
      title: `${rest.length} new alerts`,
      body: rest
        .slice(0, 4)
        .map((r) => `• ${r.title}`)
        .join("\n") + (rest.length > 4 ? `\n+${rest.length - 4} more` : ""),
      link: "/notifications",
      tag: "alerts-summary",
    });
  return out;
}

/**
 * Delivers notifications that have not been pushed yet (created in the last 24 hours) and marks them pushed.
 * When push is turned off in settings, or no device / Firebase is set up, they are marked as handled so
 * they never pile up and burst later.
 */
export async function deliverPendingPush(opts: { pushEnabled: boolean; now?: Date }): Promise<PushResult & { notifications: number }> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 24 * 3600_000);
  const rows = await db
    .select({ id: notifications.id, kind: notifications.kind, title: notifications.title, body: notifications.body, link: notifications.link })
    .from(notifications)
    .where(and(isNull(notifications.pushedAt), gt(notifications.createdAt, since)))
    .orderBy(asc(notifications.createdAt))
    .limit(200);
  if (!rows.length) return { notifications: 0, sent: 0, failed: 0, removed: 0 };
  const markAll = () =>
    db
      .update(notifications)
      .set({ pushedAt: new Date() })
      .where(inArray(notifications.id, rows.map((r) => r.id)));
  if (!opts.pushEnabled) {
    await markAll();
    return { notifications: rows.length, sent: 0, failed: 0, removed: 0, skipped: "Push is turned off in settings" };
  }
  const total: PushResult = { sent: 0, failed: 0, removed: 0 };
  try {
    for (const p of planPushes(rows)) {
      const r = await sendPush(p);
      total.sent += r.sent;
      total.failed += r.failed;
      total.removed += r.removed;
      if (r.skipped) total.skipped = r.skipped;
    }
  } catch (e) {
    // Leave them unpushed so the next run retries (within the 24-hour window).
    return { notifications: rows.length, ...total, error: e instanceof Error ? e.message : String(e) };
  }
  await markAll();
  return { notifications: rows.length, ...total };
}
