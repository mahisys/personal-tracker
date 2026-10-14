import { describe, expect, it } from "vitest";
import { buildForecast, type ForecastBill, type ForecastInput } from "./forecast-core";

const TODAY = "2026-10-14";

function bill(p: Partial<ForecastBill> & { id: string; amountPaise: number; dueDate: string }): ForecastBill {
  return { title: p.id, priority: "important", canMove: false, latestDate: null, recurrence: null, seriesId: null, ...p };
}

function input(p: Partial<ForecastInput>): ForecastInput {
  return { today: TODAY, days: 30, startBalancePaise: 100_000_00, minBalancePaise: 0, bills: [], invoices: [], payouts: [], ...p };
}

const day = (f: ReturnType<typeof buildForecast>, date: string) => f.days.find((d) => d.date === date)!;

describe("buildForecast", () => {
  it("starts at today and has one entry per day", () => {
    const f = buildForecast(input({ days: 30 }));
    expect(f.days).toHaveLength(30);
    expect(f.days[0].date).toBe(TODAY);
    expect(f.days[29].date).toBe("2026-11-12");
    expect(f.days.every((d) => d.balancePaise === 100_000_00)).toBe(true);
    expect(f.shortfall).toBeNull();
    expect(f.lowest).toEqual({ date: TODAY, balancePaise: 100_000_00 });
  });

  it("places bills on due dates and overdue bills on today", () => {
    const f = buildForecast(
      input({
        bills: [
          bill({ id: "rent", amountPaise: 30_000_00, dueDate: "2026-10-20" }),
          bill({ id: "late", amountPaise: 5_000_00, dueDate: "2026-10-01" }),
          bill({ id: "far", amountPaise: 1_00, dueDate: "2027-01-01" }),
        ],
      }),
    );
    expect(day(f, TODAY).outPaise).toBe(5_000_00);
    expect(day(f, TODAY).balancePaise).toBe(95_000_00);
    expect(day(f, "2026-10-20").outPaise).toBe(30_000_00);
    expect(day(f, "2026-10-20").balancePaise).toBe(65_000_00);
    expect(f.days.at(-1)!.balancePaise).toBe(65_000_00);
    expect(f.days.flatMap((d) => d.items).some((i) => i.id === "far")).toBe(false);
  });

  it("adds invoice balances (overdue → today+3) and payouts (gross+GST−TDS already netted; undated → +30)", () => {
    const f = buildForecast(
      input({
        days: 40,
        invoices: [
          { id: "inv1", label: "Invoice MS-1", balancePaise: 20_000_00, dueDate: "2026-10-25" },
          { id: "inv2", label: "Invoice MS-2", balancePaise: 10_000_00, dueDate: "2026-09-30" },
          { id: "paid", label: "Invoice MS-3", balancePaise: 0, dueDate: "2026-10-16" },
        ],
        payouts: [
          { id: "p1", label: "Payout A", amountPaise: 9_800_00, expectedDate: "2026-10-18" },
          { id: "p2", label: "Payout B", amountPaise: 4_000_00, expectedDate: null },
        ],
      }),
    );
    expect(day(f, "2026-10-17").inPaise).toBe(10_000_00);
    expect(day(f, "2026-10-18").inPaise).toBe(9_800_00);
    expect(day(f, "2026-10-25").inPaise).toBe(20_000_00);
    expect(day(f, "2026-11-13").items.map((i) => i.id)).toEqual(["p2"]);
    expect(day(f, "2026-10-16").inPaise).toBe(0);
    expect(f.days.at(-1)!.balancePaise).toBe(100_000_00 + 43_800_00);
  });

  it("expands recurring bills into virtual future occurrences", () => {
    const f = buildForecast(
      input({
        days: 90,
        bills: [bill({ id: "emi", amountPaise: 12_000_00, dueDate: "2026-10-31", recurrence: { freq: "monthly", interval: 1 }, canMove: true, latestDate: "2026-11-05", priority: "can_wait" })],
      }),
    );
    const emiDays = f.days.filter((d) => d.items.some((i) => i.id === "emi")).map((d) => d.date);
    // Anchored on the 31st: clamps to Nov 30, then back to Dec 31.
    expect(emiDays).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    expect(day(f, "2026-10-31").items[0].movable).toBe(true);
    expect(day(f, "2026-11-30").items[0].movable).toBe(false);
    expect(f.days.at(-1)!.balancePaise).toBe(100_000_00 - 36_000_00);
  });

  it("expands only the latest instance of a series", () => {
    const f = buildForecast(
      input({
        days: 45,
        bills: [
          bill({ id: "a1", seriesId: "a1", amountPaise: 1_000_00, dueDate: "2026-10-10", recurrence: { freq: "monthly", interval: 1 } }),
          bill({ id: "a2", seriesId: "a1", amountPaise: 1_000_00, dueDate: "2026-11-10", recurrence: { freq: "monthly", interval: 1 } }),
        ],
      }),
    );
    const out = f.days.reduce((s, d) => s + d.outPaise, 0);
    // a1 overdue on today, a2 on Nov 10, and nothing else inside 45 days (Dec 10 is outside).
    expect(out).toBe(2_000_00);
  });

  it("respects recurrence until", () => {
    const f = buildForecast(
      input({ days: 60, bills: [bill({ id: "w", amountPaise: 100_00, dueDate: "2026-10-15", recurrence: { freq: "weekly", interval: 1, until: "2026-10-29" } })] }),
    );
    expect(f.days.filter((d) => d.outPaise > 0).map((d) => d.date)).toEqual(["2026-10-15", "2026-10-22", "2026-10-29"]);
  });

  it("detects a shortfall below the threshold", () => {
    const f = buildForecast(
      input({
        startBalancePaise: 50_000_00,
        minBalancePaise: 25_000_00,
        bills: [bill({ id: "tax", amountPaise: 40_000_00, dueDate: "2026-10-20", priority: "must" })],
        invoices: [{ id: "i", label: "Inv", balancePaise: 30_000_00, dueDate: "2026-10-28" }],
      }),
    );
    expect(f.shortfall).toEqual({ firstDate: "2026-10-20", amountPaise: 15_000_00 });
    expect(f.lowest).toEqual({ date: "2026-10-20", balancePaise: 10_000_00 });
    expect(f.suggestions).toEqual([]);
  });

  it("suggests moving can-wait bills before important ones, never must-pay", () => {
    const f = buildForecast(
      input({
        startBalancePaise: 60_000_00,
        minBalancePaise: 20_000_00,
        bills: [
          bill({ id: "must", title: "GST", amountPaise: 20_000_00, dueDate: "2026-10-18", priority: "must", canMove: true, latestDate: "2026-11-30" }),
          bill({ id: "imp", title: "Vendor", amountPaise: 15_000_00, dueDate: "2026-10-18", priority: "important", canMove: true, latestDate: "2026-11-01" }),
          bill({ id: "cw", title: "Laptop", amountPaise: 10_000_00, dueDate: "2026-10-19", priority: "can_wait", canMove: true, latestDate: "2026-11-02" }),
        ],
        invoices: [{ id: "i", label: "Inv", balancePaise: 50_000_00, dueDate: "2026-10-25" }],
      }),
    );
    // 60 − 20 − 15 = 25 on the 18th (ok), −10 = 15 on the 19th (dip of 5).
    expect(f.shortfall?.firstDate).toBe("2026-10-19");
    expect(f.suggestions).toEqual([{ billId: "cw", title: "Laptop", amountPaise: 10_000_00, fromDate: "2026-10-19", toDate: "2026-11-02" }]);
  });

  it("keeps moving bills until the dip is resolved, then stops", () => {
    const f = buildForecast(
      input({
        startBalancePaise: 30_000_00,
        minBalancePaise: 10_000_00,
        bills: [
          bill({ id: "a", amountPaise: 10_000_00, dueDate: "2026-10-15", priority: "can_wait", canMove: true, latestDate: "2026-10-30" }),
          bill({ id: "b", amountPaise: 15_000_00, dueDate: "2026-10-16", priority: "important", canMove: true, latestDate: "2026-10-30" }),
          bill({ id: "c", amountPaise: 1_000_00, dueDate: "2026-10-16", priority: "important", canMove: true, latestDate: "2026-10-30" }),
        ],
        invoices: [{ id: "i", label: "Inv", balancePaise: 40_000_00, dueDate: "2026-10-25" }],
      }),
    );
    // 30 − 10 = 20 (ok) − 16 = 4 → dip. Move "a" (can_wait) → 14, resolved.
    expect(f.suggestions.map((s) => s.billId)).toEqual(["a"]);
  });

  it("moves important bills (largest first) when can-wait ones are not enough", () => {
    const f = buildForecast(
      input({
        startBalancePaise: 20_000_00,
        minBalancePaise: 5_000_00,
        bills: [
          bill({ id: "cw", amountPaise: 2_000_00, dueDate: "2026-10-15", priority: "can_wait", canMove: true, latestDate: "2026-10-28" }),
          bill({ id: "small", amountPaise: 3_000_00, dueDate: "2026-10-15", priority: "important", canMove: true, latestDate: "2026-10-28" }),
          bill({ id: "big", amountPaise: 20_000_00, dueDate: "2026-10-16", priority: "important", canMove: true, latestDate: "2026-10-28" }),
          bill({ id: "m", amountPaise: 1_000_00, dueDate: "2026-10-16", priority: "must" }),
        ],
        invoices: [{ id: "i", label: "Inv", balancePaise: 50_000_00, dueDate: "2026-10-27" }],
      }),
    );
    expect(f.suggestions.map((s) => s.billId)).toEqual(["cw", "big"]);
    expect(f.suggestions[1]).toMatchObject({ fromDate: "2026-10-16", toDate: "2026-10-28" });
  });

  it("does not suggest moves that cannot get past the dip", () => {
    const f = buildForecast(
      input({
        startBalancePaise: 10_000_00,
        minBalancePaise: 5_000_00,
        bills: [
          bill({ id: "x", amountPaise: 8_000_00, dueDate: "2026-10-15", priority: "can_wait", canMove: true, latestDate: "2026-10-17" }),
          bill({ id: "y", amountPaise: 5_000_00, dueDate: "2026-10-20", priority: "must" }),
        ],
      }),
    );
    // First dip on the 15th: moving x to the 17th helps there, but the dip moves to the 17th and nothing else can move.
    expect(f.shortfall?.firstDate).toBe("2026-10-15");
    expect(f.suggestions.map((s) => s.billId)).toEqual(["x"]);
  });

  it("can move a bill beyond the horizon", () => {
    const f = buildForecast(
      input({
        days: 30,
        startBalancePaise: 10_000_00,
        minBalancePaise: 5_000_00,
        bills: [bill({ id: "x", amountPaise: 8_000_00, dueDate: "2026-10-20", priority: "can_wait", canMove: true, latestDate: "2027-01-31" })],
      }),
    );
    expect(f.suggestions).toEqual([{ billId: "x", title: "x", amountPaise: 8_000_00, fromDate: "2026-10-20", toDate: "2027-01-31" }]);
  });
});
