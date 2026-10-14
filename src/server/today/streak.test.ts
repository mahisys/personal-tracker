import { describe, expect, it } from "vitest";
import { computeStreak, streakLine } from "./streak";

const today = "2026-10-14";

describe("computeStreak", () => {
  it("is zero with no completions", () => {
    expect(computeStreak([], today)).toEqual({ days: 0, activeToday: false, best: 0 });
  });
  it("counts consecutive days ending today", () => {
    expect(computeStreak(["2026-10-12", "2026-10-13", "2026-10-14"], today)).toMatchObject({ days: 3, activeToday: true });
  });
  it("stays alive from yesterday when nothing is done yet today", () => {
    expect(computeStreak(["2026-10-12", "2026-10-13"], today)).toMatchObject({ days: 2, activeToday: false });
  });
  it("breaks after a missed day", () => {
    expect(computeStreak(["2026-10-10", "2026-10-11", "2026-10-12"], today)).toMatchObject({ days: 0, best: 3 });
  });
  it("crosses month boundaries and tracks the best run", () => {
    const s = computeStreak(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-13", "2026-10-14"], today);
    expect(s).toEqual({ days: 2, activeToday: true, best: 3 });
  });
  it("has a friendly line", () => {
    expect(streakLine({ days: 0, activeToday: false, best: 0 })).toMatch(/start a streak/);
    expect(streakLine({ days: 4, activeToday: false, best: 4 })).toMatch(/keep it going/);
    expect(streakLine({ days: 5, activeToday: true, best: 5 })).toMatch(/best run/);
  });
});
