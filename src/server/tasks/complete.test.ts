import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, tasks, timeEntries } from "@/db/schema";
import { resetDb } from "@/test/db";
import { addDays, todayIST } from "@/lib/dates";
import { completeTaskCore, startTimerCore, stopTimerCore } from "./core";
import { moveTask, reviseEstimate, toggleTaskDone } from "./actions";
import { getAccuracy } from "./queries";

async function makeTask(values: Partial<typeof tasks.$inferInsert> = {}) {
  const [row] = await db.insert(tasks).values({ workspace: "mahisys", title: "Weekly report", ...values }).returning();
  return row;
}

describe("completing tasks", () => {
  beforeEach(resetDb);

  it("creates the next instance of a weekly task in the same series", async () => {
    const today = todayIST();
    const t = await makeTask({ dueDate: today, recurrence: { freq: "weekly", interval: 1 }, estimateMinutes: 30, tags: ["ops"], dueTime: "10:00" });
    await db.insert(tasks).values({ workspace: "mahisys", title: "Collect numbers", parentTaskId: t.id, status: "done" });

    const r = await completeTaskCore(t.id);
    expect(r?.task.status).toBe("done");
    expect(r?.task.completedAt).toBeInstanceOf(Date);
    expect(r?.next).toMatchObject({ dueDate: addDays(today, 7), seriesId: t.id, status: "todo", estimateMinutes: 30, dueTime: "10:00", tags: ["ops"] });

    // The checklist comes along, fresh
    const steps = await db.select().from(tasks).where(eq(tasks.parentTaskId, r!.next!.id));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ title: "Collect numbers", status: "todo" });

    const history = await db.select().from(activityLog).where(eq(activityLog.entityId, t.id));
    expect(history.map((h) => h.action)).toEqual(expect.arrayContaining(["completed", "recurred"]));
  });

  it("does not duplicate the next instance when re-completed", async () => {
    const today = todayIST();
    const t = await makeTask({ dueDate: today, recurrence: { freq: "daily", interval: 1 } });
    await toggleTaskDone(t.id, true);
    await toggleTaskDone(t.id, false);
    await toggleTaskDone(t.id, true);
    const series = await db.select().from(tasks).where(eq(tasks.seriesId, t.id));
    expect(series).toHaveLength(1);
    expect(series[0].dueDate).toBe(addDays(today, 1));
  });

  it("keeps the anchor day for monthly tasks across short months", async () => {
    const t = await makeTask({ dueDate: "2026-01-31", recurrence: { freq: "monthly", interval: 1 } });
    const r1 = await completeTaskCore(t.id, { today: "2026-01-31" });
    expect(r1?.next?.dueDate).toBe("2026-02-28");
    const r2 = await completeTaskCore(r1!.next!.id, { today: "2026-02-28" });
    expect(r2?.next?.dueDate).toBe("2026-03-31");
    expect(r2?.next?.seriesId).toBe(t.id);
  });

  it("skips occurrences already in the past for long-overdue tasks", async () => {
    const t = await makeTask({ dueDate: "2026-10-01", recurrence: { freq: "daily", interval: 1 } });
    const r = await completeTaskCore(t.id, { today: "2026-10-14" });
    expect(r?.next?.dueDate).toBe("2026-10-14");
  });

  it("stops repeating after the until date", async () => {
    const t = await makeTask({ dueDate: "2026-10-14", recurrence: { freq: "weekly", interval: 1, until: "2026-10-20" } });
    const r = await completeTaskCore(t.id, { today: "2026-10-14" });
    expect(r?.next).toBeNull();
  });

  it("celebrates and reports an overrun when logged time beats the estimate", async () => {
    const t = await makeTask({ estimateMinutes: 60, taskType: "development" });
    await db.insert(timeEntries).values({ taskId: t.id, startedAt: new Date(), endedAt: new Date(), minutes: 90 });
    const r = await toggleTaskDone(t.id, true);
    expect(r).toMatchObject({ ok: true, celebrate: true });
    expect(r.overrun).toMatchObject({ taskId: t.id, estimateMinutes: 60, actualMinutes: 90 });
  });

  it("moving a card to Done completes it", async () => {
    const t = await makeTask({});
    const r = await moveTask(t.id, "done");
    expect(r.celebrate).toBe(true);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(row.status).toBe("done");
    await moveTask(t.id, "doing");
    const [again] = await db.select().from(tasks).where(eq(tasks.id, t.id));
    expect(again).toMatchObject({ status: "doing", completedAt: null });
  });
});

describe("estimate revisions", () => {
  beforeEach(resetDb);

  it("stores the revision, updates the open series and keeps the original for accuracy", async () => {
    const t = await makeTask({ dueDate: todayIST(), estimateMinutes: 60, taskType: "development", recurrence: { freq: "weekly", interval: 1 } });
    await db.insert(timeEntries).values({ taskId: t.id, startedAt: new Date(), endedAt: new Date(), minutes: 90 });
    const done = await completeTaskCore(t.id);
    const r = await reviseEstimate(t.id, 90, true);
    expect(r.ok).toBe(true);
    const [next] = await db.select().from(tasks).where(eq(tasks.id, done!.next!.id));
    expect(next.estimateMinutes).toBe(90);
    const [rev] = await db.select().from(activityLog).where(and(eq(activityLog.entityId, t.id), eq(activityLog.action, "estimate_revised")));
    expect(rev.details).toEqual({ from: 60, to: 90 });
    const acc = await getAccuracy();
    expect(acc.overall).toMatchObject({ count: 1, estimateMinutes: 60, actualMinutes: 90 });
  });
});

describe("timers", () => {
  beforeEach(resetDb);

  it("keeps only one timer running and logs elapsed minutes", async () => {
    const a = await makeTask({ title: "A" });
    const b = await makeTask({ title: "B", estimateMinutes: 20 });
    const t0 = new Date("2026-10-14T04:00:00Z");
    await startTimerCore(a.id, t0);
    const { stopped } = await startTimerCore(b.id, new Date(t0.getTime() + 25 * 60_000));
    expect(stopped).toMatchObject({ taskId: a.id, minutes: 25, discarded: false });
    const running = await db.select().from(timeEntries).where(isNull(timeEntries.endedAt));
    expect(running).toHaveLength(1);
    expect(running[0].taskId).toBe(b.id);
    const [bRow] = await db.select().from(tasks).where(eq(tasks.id, b.id));
    expect(bRow.status).toBe("doing");

    const end = await stopTimerCore(new Date(t0.getTime() + 55 * 60_000));
    expect(end).toMatchObject({ taskId: b.id, minutes: 30 });
    expect(end?.overrun).toMatchObject({ estimateMinutes: 20, actualMinutes: 30 });
    expect(await stopTimerCore()).toBeNull();
  });

  it("discards a timer stopped within a minute", async () => {
    const a = await makeTask({});
    const t0 = new Date();
    await startTimerCore(a.id, t0);
    const r = await stopTimerCore(new Date(t0.getTime() + 20_000));
    expect(r?.discarded).toBe(true);
    expect(await db.select().from(timeEntries)).toHaveLength(0);
  });
});
