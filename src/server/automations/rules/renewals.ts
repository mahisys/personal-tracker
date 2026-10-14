import "server-only";
import { isNull } from "drizzle-orm";
import { db } from "@/db";
import { renewals } from "@/db/schema";
import { addDays, diffDays, formatDay } from "@/lib/dates";
import { createAutoTask, hasOpenTaggedTask, raiseOnce } from "../helpers";
import type { Rule } from "../types";

/** Inside the reminder window: days left (negative = expired) and when the renewal task should be due. */
export function decideRenewal(
  r: { expiresOn: string; remindDaysBefore: number; renewedAt: Date | null },
  today: string,
): { daysLeft: number; taskDue: string } | null {
  if (r.renewedAt) return null;
  const daysLeft = diffDays(today, r.expiresOn);
  if (daysLeft > Math.max(0, r.remindDaysBefore)) return null;
  const ideal = addDays(r.expiresOn, -7);
  return { daysLeft, taskDue: ideal > today ? ideal : today };
}

export const renewalsRule: Rule = {
  key: "renewals",
  async run({ today }) {
    const rows = await db.select().from(renewals).where(isNull(renewals.renewedAt));
    let n = 0;
    let t = 0;
    for (const r of rows) {
      const d = decideRenewal(r, today);
      if (!d) continue;
      const tag = `renewal:${r.id}`;
      const expired = d.daysLeft < 0;
      const raised = await raiseOnce({
        kind: "renewal",
        dedupeKey: expired ? `renewal_expired:${r.id}:${r.expiresOn}` : `renewal:${r.id}:${r.expiresOn}`,
        title: expired ? `${r.name} expired on ${formatDay(r.expiresOn)}` : `${r.name} expires ${d.daysLeft === 0 ? "today" : `in ${d.daysLeft} days`}`,
        body: expired ? "Renew it as soon as you can." : `Expires ${formatDay(r.expiresOn)}. A renewal task is on your list.`,
        link: "/planner/renewals",
        workspace: r.workspace,
      });
      if (raised) n++;
      if (raised && !(await hasOpenTaggedTask(tag))) {
        await createAutoTask({
          workspace: r.workspace,
          title: `Renew ${r.name}`,
          description: [r.number ? `Number: ${r.number}` : "", `Expires ${formatDay(r.expiresOn)}.`, r.notes].filter(Boolean).join("\n"),
          dueDate: d.taskDue,
          priority: d.daysLeft <= 7 ? 1 : 2,
          tags: [tag],
          taskType: "chore",
        });
        t++;
      }
    }
    return { notifications: n, tasks: t, note: `${rows.length} renewals checked` };
  },
};
