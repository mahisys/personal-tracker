import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { leads, leadStages } from "@/db/schema";
import { diffDays, formatDateTime, toISTDate } from "@/lib/dates";
import { hasOpenLinkedTask, raiseOnce, raiseWithTask } from "../helpers";
import { numConfig } from "../meta";
import { isAtOrAfter, normaliseTime, type Rule } from "../types";

export type LeadLite = {
  id: string;
  title: string;
  nextFollowUpAt: Date | null;
  lastActivityAt: Date | null;
  createdAt: Date;
};

/**
 * Follow-up reminder for an open lead: when its follow-up time has passed, or (optionally, after the
 * morning digest time) when it has none at all. One per lead per IST day.
 */
export function decideLeadFollowup(
  lead: Pick<LeadLite, "id" | "title" | "nextFollowUpAt">,
  opts: { now: Date; today: string; time: string; remindMissing: boolean; missingAfter: string },
): { dedupeKey: string; title: string; body: string } | null {
  const dedupeKey = `lead_followup:${lead.id}:${opts.today}`;
  if (lead.nextFollowUpAt) {
    if (lead.nextFollowUpAt.getTime() > opts.now.getTime()) return null;
    return { dedupeKey, title: `Follow up: ${lead.title}`, body: `Planned for ${formatDateTime(lead.nextFollowUpAt)}. A quick call keeps it warm.` };
  }
  if (!opts.remindMissing || !isAtOrAfter(opts.time, opts.missingAfter)) return null;
  return { dedupeKey, title: `Plan the next step: ${lead.title}`, body: "No follow-up is scheduled for this lead yet." };
}

/** Days since the lead last had activity (or was created), in IST calendar days; null when not stale. */
export function decideStaleLead(lead: Pick<LeadLite, "lastActivityAt" | "createdAt">, today: string, days: number): number | null {
  const last = lead.lastActivityAt ?? lead.createdAt;
  const quiet = diffDays(toISTDate(last), today);
  return quiet >= days ? quiet : null;
}

async function openLeads(): Promise<LeadLite[]> {
  return db
    .select({ id: leads.id, title: leads.title, nextFollowUpAt: leads.nextFollowUpAt, lastActivityAt: leads.lastActivityAt, createdAt: leads.createdAt })
    .from(leads)
    .innerJoin(leadStages, eq(leads.stageId, leadStages.id))
    .where(eq(leadStages.kind, "open"));
}

export const leadFollowups: Rule = {
  key: "lead_followups",
  async run({ now, today, time, config, settings }) {
    const rows = await openLeads();
    const remindMissing = numConfig(config, "remindMissing", 1, 0, 1) === 1;
    const missingAfter = normaliseTime(settings.notifications.digestTime);
    let n = 0;
    for (const l of rows) {
      const r = decideLeadFollowup(l, { now, today, time, remindMissing, missingAfter });
      if (!r) continue;
      if (await raiseOnce({ kind: "lead_followup", ...r, link: `/crm/leads/${l.id}`, workspace: "mahisys" })) n++;
    }
    return { notifications: n, note: `${rows.length} open leads checked` };
  },
};

export const staleLeads: Rule = {
  key: "stale_leads",
  async run({ today, config }) {
    const days = numConfig(config, "days", 7, 1, 365);
    const rows = await openLeads();
    let n = 0;
    let t = 0;
    for (const l of rows) {
      const quiet = decideStaleLead(l, today, days);
      if (quiet == null) continue;
      if (await hasOpenLinkedTask("lead", l.id)) continue;
      const res = await raiseWithTask(
        {
          kind: "stale_lead",
          dedupeKey: `stale_lead:${l.id}:${today}`,
          title: `${l.title} has gone quiet`,
          body: `No activity for ${quiet} days — added a follow-up task for today.`,
          link: `/crm/leads/${l.id}`,
          workspace: "mahisys",
        },
        {
          workspace: "mahisys",
          title: `Follow up: ${l.title}`,
          description: `No activity for ${quiet} days. A short check-in call or WhatsApp keeps the conversation alive.`,
          dueDate: today,
          priority: 2,
          linkedType: "lead",
          linkedId: l.id,
          taskType: "sales call",
        },
      );
      if (res.raised) n++;
      if (res.taskId) t++;
    }
    return { notifications: n, tasks: t, note: `${rows.length} open leads checked` };
  },
};

