import "server-only";
import { isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { bills, tasks, type Recurrence } from "@/db/schema";
import { addDays, diffDays, formatDay } from "@/lib/dates";
import { nextOccurrence } from "@/lib/recurrence";
import { logActivity } from "@/server/activity";
import { raiseOnce } from "../helpers";
import type { Rule } from "../types";

export type SeriesInstance = {
  id: string;
  /** open = still to do / upcoming */
  open: boolean;
  /** finished normally (task done, bill paid or skipped) */
  finished: boolean;
  dueDate: string | null;
  /** When it was finished (completedAt / updatedAt) */
  finishedAt: Date | null;
  recurrence: Recurrence | null;
};

/** How recently the last instance must have been finished for the safety net to act. */
export const CATCHUP_WINDOW_HOURS = 72;
/** Leave the normal completion flow time to create the next instance itself. */
export const CATCHUP_SETTLE_MINUTES = 10;

/**
 * Conservative safety net for recurring series. Returns the due date of the missing next instance, or null.
 * Acts only when: no instance is open, the latest instance (by due date) was finished normally within the
 * last 72 hours (but at least 10 minutes ago), it still carries a recurrence, and the next date
 * does not already exist in the series. A series deliberately stopped long ago is never revived.
 */
export function decideCatchup(instances: SeriesInstance[], now: Date): string | null {
  if (!instances.length || instances.some((i) => i.open)) return null;
  const dated = instances.filter((i) => i.dueDate).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0));
  const latest = dated[dated.length - 1];
  if (!latest || !latest.finished || !latest.recurrence || !latest.finishedAt) return null;
  const ageMin = (now.getTime() - latest.finishedAt.getTime()) / 60_000;
  if (ageMin < CATCHUP_SETTLE_MINUTES || ageMin > CATCHUP_WINDOW_HOURS * 60) return null;
  const first = dated[0];
  const anchorDay = Number(first.dueDate!.slice(8, 10));
  const next = nextOccurrence(latest.recurrence, latest.dueDate!, anchorDay);
  if (!next) return null;
  if (instances.some((i) => i.dueDate === next)) return null;
  return next;
}

export const recurringCatchup: Rule = {
  key: "recurring_catchup",
  async run({ now }) {
    let created = 0;

    // Tasks
    const taskRows = await db.select().from(tasks).where(or(isNotNull(tasks.recurrence), isNotNull(tasks.seriesId)));
    const taskSeries = new Map<string, typeof taskRows>();
    for (const t of taskRows) {
      const k = t.seriesId ?? t.id;
      taskSeries.set(k, [...(taskSeries.get(k) ?? []), t]);
    }
    for (const [root, rows] of taskSeries) {
      const next = decideCatchup(
        rows.map((t) => ({
          id: t.id,
          open: t.status === "todo" || t.status === "doing" || t.status === "waiting",
          finished: t.status === "done",
          dueDate: t.dueDate,
          finishedAt: t.completedAt ?? t.updatedAt,
          recurrence: t.recurrence,
        })),
        now,
      );
      if (!next) continue;
      const latest = rows.filter((r) => r.dueDate).sort((a, b) => (a.dueDate! < b.dueDate! ? 1 : -1))[0];
      const [row] = await db
        .insert(tasks)
        .values({
          workspace: latest.workspace,
          projectId: latest.projectId,
          milestoneId: latest.milestoneId,
          title: latest.title,
          description: latest.description,
          priority: latest.priority,
          taskType: latest.taskType,
          dueDate: next,
          dueTime: latest.dueTime,
          estimateMinutes: latest.estimateMinutes,
          recurrence: latest.recurrence,
          seriesId: root,
          linkedType: latest.linkedType,
          linkedId: latest.linkedId,
          tags: latest.tags,
        })
        .returning({ id: tasks.id });
      await logActivity("task", row.id, "created", "Next repeat created by the recurring safety net");
      await raiseOnce({
        kind: "recurring",
        dedupeKey: `recurring:task:${root}:${next}`,
        title: `Next “${latest.title}” scheduled`,
        body: `The repeat for ${formatDay(next)} was missing, so it was added.`,
        link: `/tasks/${row.id}`,
        workspace: latest.workspace,
      });
      created++;
    }

    // Bills
    const billRows = await db.select().from(bills).where(or(isNotNull(bills.recurrence), isNotNull(bills.seriesId)));
    const billSeries = new Map<string, typeof billRows>();
    for (const b of billRows) {
      const k = b.seriesId ?? b.id;
      billSeries.set(k, [...(billSeries.get(k) ?? []), b]);
    }
    for (const [root, rows] of billSeries) {
      const next = decideCatchup(
        rows.map((b) => ({
          id: b.id,
          open: b.status === "upcoming",
          finished: b.status === "paid" || b.status === "skipped",
          dueDate: b.dueDate,
          finishedAt: b.updatedAt,
          recurrence: b.recurrence,
        })),
        now,
      );
      if (!next) continue;
      const latest = [...rows].sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))[0];
      const shift = diffDays(latest.dueDate, next);
      const [row] = await db
        .insert(bills)
        .values({
          workspace: latest.workspace,
          title: latest.title,
          payee: latest.payee,
          kind: latest.kind,
          categoryId: latest.categoryId,
          accountId: latest.accountId,
          amountPaise: latest.amountPaise,
          dueDate: next,
          priority: latest.priority,
          canMove: latest.canMove,
          latestDate: latest.latestDate ? addDays(latest.latestDate, shift) : null,
          recurrence: latest.recurrence,
          seriesId: root,
          remindDaysBefore: latest.remindDaysBefore,
          notes: latest.notes,
        })
        .returning({ id: bills.id });
      await logActivity("bill", row.id, "created", "Next repeat created by the recurring safety net");
      await raiseOnce({
        kind: "recurring",
        dedupeKey: `recurring:bill:${root}:${next}`,
        title: `Next “${latest.title}” scheduled`,
        body: `The ${formatDay(next)} instance was missing, so it was added to your planner.`,
        link: `/planner/bills/${row.id}`,
        workspace: latest.workspace,
      });
      created++;
    }

    return { notifications: created, created, note: `${taskSeries.size} task and ${billSeries.size} bill series checked` };
  },
};
