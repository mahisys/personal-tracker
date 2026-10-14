"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { automationRules, notifications } from "@/db/schema";
import { done, fail, str, type ActionResult } from "@/lib/action";
import { requireUser } from "@/server/auth";
import { createNotification } from "@/server/notify";
import { sendPush } from "@/server/messaging/push";
import { alertRecipient, sendEmail } from "@/server/messaging/email";
import { renderBriefingEmail } from "@/server/messaging/briefing";
import { ensureRules, loadSettingsFresh, runAutomations } from "./engine";
import { appUrl } from "./helpers";
import { mergeConfig, RULE_KEYS, RULE_META, type RuleKey } from "./meta";

function ruleKey(form: FormData): RuleKey | null {
  const k = str(form, "key");
  return k && (RULE_KEYS as readonly string[]).includes(k) ? (k as RuleKey) : null;
}

export async function toggleRule(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const key = ruleKey(form);
  if (!key) return fail("Unknown automation");
  const enabled = str(form, "enabled") === "true";
  await ensureRules();
  await db.update(automationRules).set({ enabled }).where(eq(automationRules.key, key));
  revalidatePath("/automations");
  return done(enabled ? `${RULE_META[key].name} is on` : `${RULE_META[key].name} paused`);
}

export async function saveRuleConfig(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const key = ruleKey(form);
  if (!key) return fail("Unknown automation");
  const meta = RULE_META[key];
  await ensureRules();
  const [row] = await db.select().from(automationRules).where(eq(automationRules.key, key));
  const config = mergeConfig(key, row?.config);
  for (const f of meta.fields) {
    const raw = str(form, f.key);
    if (raw == null) continue;
    let value: unknown;
    if (f.type === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) return fail(`${f.label} must be a number`);
      if ((f.min != null && n < f.min) || (f.max != null && n > f.max)) return fail(`${f.label} must be between ${f.min} and ${f.max}`);
      value = Math.round(n);
    } else {
      const nums = raw.split(",").map((x) => Number(x.trim()));
      if (!nums.length || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) return fail(`${f.label}: use whole days like 1, 7, 15`);
      value = [...new Set(nums)].sort((a, b) => a - b);
    }
    const [head, sub] = f.key.split(".");
    if (sub) config[head] = { ...((config[head] as object) ?? {}), [sub]: value };
    else config[head] = value;
  }
  await db.update(automationRules).set({ config }).where(eq(automationRules.key, key));
  revalidatePath("/automations");
  return done("Saved — the next run uses this");
}

export async function runAutomationsNow(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const key = ruleKey(form);
  try {
    const res = await runAutomations({ trigger: "manual", only: key ? [key] : undefined });
    revalidatePath("/automations");
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    const alerts = res.rules.reduce((s, r) => s + r.notifications, 0);
    const tasks = res.rules.reduce((s, r) => s + (r.tasks ?? 0), 0);
    const failed = res.rules.filter((r) => !r.ok);
    if (failed.length) return fail(`${failed.length} rule${failed.length === 1 ? "" : "s"} hit a problem: ${failed.map((f) => RULE_META[f.key].name).join(", ")}`);
    if (!alerts && !tasks) return done("All quiet — nothing needs you right now");
    return done(`Done — ${alerts} new alert${alerts === 1 ? "" : "s"}${tasks ? `, ${tasks} task${tasks === 1 ? "" : "s"}` : ""}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The run failed");
  }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/** Marks one alert read (called from the alert list before navigating to its link). */
export async function markNotificationRead(id: string): Promise<void> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), isNull(notifications.readAt)));
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function markNotificationUnread(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing alert");
  await db.update(notifications).set({ readAt: null }).where(eq(notifications.id, id));
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return done("Marked unread");
}

export async function markAllNotificationsRead(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const ids = form.getAll("ids").map(String).filter(Boolean);
  const where = ids.length ? and(isNull(notifications.readAt), inArray(notifications.id, ids)) : isNull(notifications.readAt);
  const rows = await db.update(notifications).set({ readAt: new Date() }).where(where).returning({ id: notifications.id });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return done(rows.length ? `All caught up — ${rows.length} marked read` : "Already all caught up");
}

export async function deleteNotification(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing alert");
  await db.delete(notifications).where(eq(notifications.id, id));
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return done("Alert removed");
}

/** Sends a test alert to this app's devices (and email when email is on), and reports what happened. */
export async function sendTestNotification(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const settings = await loadSettingsFresh();
  const withEmail = str(form, "email") === "1";
  const n = await createNotification({
    kind: "test",
    title: "Hello from Command Center 👋",
    body: "Notifications are working. You'll hear from us only when something needs you.",
    link: "/notifications",
  });
  const parts: string[] = [];
  try {
    const r = await sendPush({ title: n!.title, body: n!.body, link: "/notifications", tag: "test" });
    if (n) await db.update(notifications).set({ pushedAt: new Date() }).where(eq(notifications.id, n.id));
    parts.push(r.skipped ? `Push: ${r.skipped.toLowerCase()}` : `Push sent to ${r.sent} device${r.sent === 1 ? "" : "s"}${r.failed ? ` (${r.failed} failed)` : ""}`);
  } catch (e) {
    parts.push(`Push failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (withEmail) {
    const mail = renderBriefingEmail(
      {
        kind: "digest",
        title: "Test email from Command Center",
        subtitle: "If you can read this, your daily digest will arrive here.",
        summary: "",
        stats: [],
        sections: [{ heading: "All set", items: [{ label: "Open your alerts", href: "/notifications", tone: "good" }] }],
        footer: "Have a lovely day.",
      },
      appUrl("/"),
    );
    const r = await sendEmail({ to: alertRecipient(settings.notifications.digestEmail), ...mail });
    parts.push(r.ok ? "Email sent" : r.skipped ? `Email: ${r.reason.toLowerCase()}` : `Email failed: ${r.error}`);
  }
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return done(parts.join(" · "));
}
