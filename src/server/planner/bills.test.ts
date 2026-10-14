import { describe, expect, it } from "vitest";
import { billGroup, groupBills, parseRemindDays, renewalUrgency, shiftLatestDate } from "./bills";

describe("planner bills helpers", () => {
  const today = "2026-10-14";
  it("groups bills into overdue / this week / this month / later", () => {
    expect(billGroup("2026-10-13", today)).toBe("overdue");
    expect(billGroup("2026-10-14", today)).toBe("week");
    expect(billGroup("2026-10-20", today)).toBe("week");
    expect(billGroup("2026-10-21", today)).toBe("month");
    expect(billGroup("2026-10-31", today)).toBe("month");
    expect(billGroup("2026-11-01", today)).toBe("later");
    const groups = groupBills([{ dueDate: "2026-12-01" }, { dueDate: "2026-10-01" }, { dueDate: "2026-10-15" }], today);
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([
      ["overdue", 1],
      ["week", 1],
      ["later", 1],
    ]);
  });

  it("parses reminder days", () => {
    expect(parseRemindDays("3, 1, 7, 3, x, -1")).toEqual([7, 3, 1]);
    expect(parseRemindDays("")).toEqual([]);
  });

  it("keeps the latest-date slack for the next instance", () => {
    expect(shiftLatestDate("2026-10-05", "2026-10-10", "2026-11-05")).toBe("2026-11-10");
    expect(shiftLatestDate("2026-10-05", null, "2026-11-05")).toBeNull();
  });

  it("describes renewal urgency", () => {
    expect(renewalUrgency("2026-10-10", today)).toMatchObject({ tone: "bad", label: "Expired 4 days ago" });
    expect(renewalUrgency("2026-10-14", today).label).toBe("Expires today");
    expect(renewalUrgency("2026-10-17", today)).toMatchObject({ tone: "bad", label: "3 days left" });
    expect(renewalUrgency("2026-11-01", today)).toMatchObject({ tone: "warn" });
    expect(renewalUrgency("2026-12-31", today)).toMatchObject({ tone: "info" });
    expect(renewalUrgency("2028-10-14", today)).toMatchObject({ tone: "good", label: "2y 0m left" });
  });
});
