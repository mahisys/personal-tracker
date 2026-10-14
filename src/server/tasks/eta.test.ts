import { describe, expect, it } from "vitest";
import { computeEta, compareForSchedule, nextWorkday, projectHealth, type EtaTask } from "./eta";

// 2026-10-12 is a Monday.
const MON = "2026-10-12";
const MON_TO_FRI = [1, 2, 3, 4, 5];
const t = (id: string, remainingMinutes: number | null, extra: Partial<EtaTask> = {}): EtaTask => ({
  id,
  priority: 3,
  createdAt: "2026-10-01T00:00:00Z",
  remainingMinutes,
  ...extra,
});

describe("nextWorkday", () => {
  it("returns the same day when it is a workday", () => {
    expect(nextWorkday(MON, MON_TO_FRI)).toBe(MON);
  });
  it("skips the weekend", () => {
    expect(nextWorkday("2026-10-17", MON_TO_FRI)).toBe("2026-10-19");
  });
});

describe("compareForSchedule", () => {
  it("orders by priority, then due date (undated last), then created", () => {
    const list = [
      t("c", 60, { priority: 2, dueDate: null }),
      t("d", 60, { priority: 1, dueDate: "2026-10-20" }),
      t("b", 60, { priority: 2, dueDate: "2026-10-15" }),
      t("e", 60, { priority: 1, dueDate: "2026-10-20", createdAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(list.sort(compareForSchedule).map((x) => x.id)).toEqual(["e", "d", "b", "c"]);
  });
});

describe("computeEta", () => {
  it("fits small tasks into today", () => {
    const r = computeEta({ tasks: [t("a", 60), t("b", 120)], dailyHours: 6, workdays: MON_TO_FRI, today: MON });
    expect(r.tasks.a.finishDate).toBe(MON);
    expect(r.tasks.b.finishDate).toBe(MON);
    expect(r.queueFinishDate).toBe(MON);
  });

  it("rolls capacity over to following days", () => {
    // 6h/day. a = 4h (Mon), b = 5h → 2h Mon + 3h Tue, c = 4h → 3h Tue + 1h Wed
    const r = computeEta({
      tasks: [t("a", 240, { priority: 1 }), t("b", 300, { priority: 2 }), t("c", 240, { priority: 3 })],
      dailyHours: 6,
      workdays: MON_TO_FRI,
      today: MON,
    });
    expect(r.tasks.a).toMatchObject({ startDate: MON, finishDate: MON });
    expect(r.tasks.b).toMatchObject({ startDate: MON, finishDate: "2026-10-13" });
    expect(r.tasks.c).toMatchObject({ startDate: "2026-10-13", finishDate: "2026-10-14" });
  });

  it("starts the next day when a task exactly fills today", () => {
    const r = computeEta({ tasks: [t("a", 360, { priority: 1 }), t("b", 30, { priority: 2 })], dailyHours: 6, workdays: MON_TO_FRI, today: MON });
    expect(r.tasks.a.finishDate).toBe(MON);
    expect(r.tasks.b).toMatchObject({ startDate: "2026-10-13", finishDate: "2026-10-13" });
  });

  it("skips weekends", () => {
    // Friday 16 Oct, 2 days of work at 6h/day → Fri + Mon
    const r = computeEta({ tasks: [t("a", 720)], dailyHours: 6, workdays: MON_TO_FRI, today: "2026-10-16" });
    expect(r.tasks.a).toMatchObject({ startDate: "2026-10-16", finishDate: "2026-10-19" });
  });

  it("starts on the next workday when today is a day off", () => {
    const r = computeEta({ tasks: [t("a", 60)], dailyHours: 6, workdays: MON_TO_FRI, today: "2026-10-18" });
    expect(r.tasks.a.finishDate).toBe("2026-10-19");
  });

  it("skips tasks without an estimate", () => {
    const r = computeEta({ tasks: [t("a", null), t("b", 60)], dailyHours: 6, workdays: MON_TO_FRI, today: MON });
    expect(r.skipped).toEqual(["a"]);
    expect(r.tasks.a).toBeUndefined();
    expect(r.tasks.b.finishDate).toBe(MON);
  });

  it("treats zero remaining work as finishing on the current day", () => {
    const r = computeEta({ tasks: [t("a", 0)], dailyHours: 6, workdays: MON_TO_FRI, today: MON });
    expect(r.tasks.a).toMatchObject({ finishDate: MON, scheduledMinutes: 0 });
  });

  it("applies the overrun factor", () => {
    // 5h × 1.5 = 7.5h → spills into Tuesday
    const r = computeEta({ tasks: [t("a", 300)], dailyHours: 6, workdays: MON_TO_FRI, today: MON, overrunFactor: 1.5 });
    expect(r.tasks.a).toMatchObject({ finishDate: "2026-10-13", scheduledMinutes: 450 });
  });

  it("respects time already used today", () => {
    const r = computeEta({ tasks: [t("a", 120)], dailyHours: 6, workdays: MON_TO_FRI, today: MON, usedTodayMinutes: 300 });
    expect(r.tasks.a.finishDate).toBe("2026-10-13");
  });

  it("flags tasks projected past their own due date", () => {
    const r = computeEta({
      tasks: [t("a", 600, { priority: 1 }), t("b", 120, { priority: 2, dueDate: MON })],
      dailyHours: 6,
      workdays: MON_TO_FRI,
      today: MON,
    });
    expect(r.tasks.b.late).toBe(true);
    expect(r.tasks.a.late).toBe(false);
  });

  it("schedules nothing when no capacity is configured", () => {
    const r = computeEta({ tasks: [t("a", 60)], dailyHours: 0, workdays: MON_TO_FRI, today: MON });
    expect(r.skipped).toEqual(["a"]);
    expect(r.queueFinishDate).toBeNull();
  });

  it("projects a project's finish and detects a deadline breach", () => {
    const r = computeEta({
      tasks: [
        t("a", 360, { projectId: "p1", priority: 1 }),
        t("b", 360, { projectId: "p1", priority: 1 }),
        t("c", 60, { projectId: "p2", priority: 2 }),
      ],
      projects: [
        { id: "p1", deadline: MON },
        { id: "p2", deadline: "2026-10-30" },
        { id: "p3", deadline: "2026-10-30" },
      ],
      dailyHours: 6,
      workdays: MON_TO_FRI,
      today: MON,
    });
    expect(r.projects.p1).toMatchObject({ finishDate: "2026-10-13", late: true, health: "late", scheduled: 2, remainingMinutes: 720 });
    expect(r.projects.p2).toMatchObject({ finishDate: "2026-10-14", late: false, health: "on_track" });
    expect(r.projects.p3).toMatchObject({ finishDate: null, health: "on_track", scheduled: 0 });
  });

  it("counts unestimated project tasks and marks the project at risk", () => {
    const r = computeEta({
      tasks: [t("a", 60, { projectId: "p1" }), t("b", null, { projectId: "p1" })],
      projects: [{ id: "p1", deadline: "2026-10-30" }],
      dailyHours: 6,
      workdays: MON_TO_FRI,
      today: MON,
    });
    expect(r.projects.p1).toMatchObject({ unestimated: 1, scheduled: 1, health: "at_risk" });
  });
});

describe("projectHealth", () => {
  const base = { unestimated: 0, scheduled: 1 };
  it("is late once the deadline has passed with work left", () => {
    expect(projectHealth({ ...base, finishDate: MON, deadline: "2026-10-09" }, MON, MON_TO_FRI)).toBe("late");
  });
  it("is at risk with one working day or less to spare", () => {
    // finish Fri 16, deadline Mon 19 → 1 working day of buffer
    expect(projectHealth({ ...base, finishDate: "2026-10-16", deadline: "2026-10-19" }, MON, MON_TO_FRI)).toBe("at_risk");
    expect(projectHealth({ ...base, finishDate: "2026-10-16", deadline: "2026-10-16" }, MON, MON_TO_FRI)).toBe("at_risk");
  });
  it("is on track with two or more working days to spare", () => {
    expect(projectHealth({ ...base, finishDate: "2026-10-14", deadline: "2026-10-16" }, MON, MON_TO_FRI)).toBe("on_track");
  });
  it("has no data without a deadline", () => {
    expect(projectHealth({ ...base, finishDate: MON, deadline: null }, MON, MON_TO_FRI)).toBe("no_data");
  });
});
