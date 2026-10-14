import { describe, expect, it } from "vitest";
import { accuracyInsight, computeAccuracy, etaFactor, formatRatio } from "./accuracy";
import { bucketFor, endOfWeek, groupByBucket } from "./grouping";

describe("computeAccuracy", () => {
  it("weights by minutes and groups by task type", () => {
    const acc = computeAccuracy([
      { taskType: "Development", estimateMinutes: 60, actualMinutes: 90 },
      { taskType: "development ", estimateMinutes: 120, actualMinutes: 150 },
      { taskType: "call", estimateMinutes: 30, actualMinutes: 30 },
      { taskType: null, estimateMinutes: 60, actualMinutes: 30 },
    ]);
    expect(acc.overall).toMatchObject({ count: 4, estimateMinutes: 270, actualMinutes: 300 });
    expect(acc.overall!.ratio).toBeCloseTo(300 / 270);
    expect(acc.byType[0]).toMatchObject({ taskType: "development", count: 2, ratio: 240 / 180 });
    expect(acc.byType[1]).toMatchObject({ taskType: "call", count: 1, ratio: 1 });
  });

  it("ignores tasks missing an estimate or logged time", () => {
    const acc = computeAccuracy([
      { estimateMinutes: null, actualMinutes: 30 },
      { estimateMinutes: 30, actualMinutes: 0 },
      { estimateMinutes: 0, actualMinutes: 30 },
    ]);
    expect(acc.overall).toBeNull();
    expect(acc.byType).toEqual([]);
  });
});

describe("accuracyInsight", () => {
  const dev = (e: number, a: number) => ({ taskType: "development", estimateMinutes: e, actualMinutes: a });

  it("needs at least three samples", () => {
    expect(accuracyInsight(computeAccuracy([dev(60, 90), dev(60, 90)]))).toBeNull();
  });

  it("talks about the most common notable task type", () => {
    const ins = accuracyInsight(computeAccuracy([dev(60, 78), dev(60, 78), dev(60, 78)]));
    expect(ins?.headline).toBe("You usually take 1.3× your estimate for development");
    expect(ins?.tone).toBe("warn");
  });

  it("praises well calibrated estimates", () => {
    const ins = accuracyInsight(computeAccuracy([dev(60, 60), dev(60, 62), dev(60, 58)]));
    expect(ins?.tone).toBe("good");
  });

  it("notices when you are quicker than planned", () => {
    const ins = accuracyInsight(computeAccuracy([dev(60, 30), dev(60, 30), dev(60, 30)]));
    expect(ins?.headline).toContain("0.5×");
    expect(ins?.tone).toBe("info");
  });
});

describe("etaFactor / formatRatio", () => {
  it("clamps and needs enough samples", () => {
    const s = (a: number) => ({ estimateMinutes: 10, actualMinutes: a });
    expect(etaFactor(computeAccuracy([s(50)]))).toBe(1);
    expect(etaFactor(computeAccuracy([s(50), s(50), s(50)]))).toBe(3);
    expect(etaFactor(computeAccuracy([s(12), s(12), s(12)]))).toBeCloseTo(1.2);
  });
  it("formats ratios", () => {
    expect(formatRatio(1.333)).toBe("1.3×");
    expect(formatRatio(2)).toBe("2×");
  });
});

describe("grouping", () => {
  const today = "2026-10-14"; // Wednesday
  it("computes the end of the week (Sunday)", () => {
    expect(endOfWeek(today)).toBe("2026-10-18");
    expect(endOfWeek("2026-10-18")).toBe("2026-10-18");
  });
  it("buckets due dates", () => {
    expect(bucketFor("2026-10-13", today)).toBe("overdue");
    expect(bucketFor(today, today)).toBe("today");
    expect(bucketFor("2026-10-15", today)).toBe("tomorrow");
    expect(bucketFor("2026-10-18", today)).toBe("week");
    expect(bucketFor("2026-10-19", today)).toBe("later");
    expect(bucketFor(null, today)).toBe("none");
  });
  it("groups in display order and drops empty buckets", () => {
    const g = groupByBucket([{ dueDate: null }, { dueDate: "2026-10-01" }, { dueDate: today }], today);
    expect(g.map((x) => x.bucket)).toEqual(["overdue", "today", "none"]);
  });
});
