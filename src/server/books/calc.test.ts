import { describe, expect, it } from "vitest";
import { accountEffect, balanceSeries, budgetState, buildStatement, lastMonths, monthRange } from "./calc";

describe("books calc", () => {
  const acct = { id: "a", openingBalancePaise: 1000 };
  const txns = [
    { id: "2", type: "expense" as const, date: "2026-10-02", accountId: "a", transferAccountId: null, amountPaise: 300 },
    { id: "1", type: "income" as const, date: "2026-10-01", accountId: "a", transferAccountId: null, amountPaise: 500 },
    { id: "3", type: "transfer" as const, date: "2026-10-03", accountId: "b", transferAccountId: "a", amountPaise: 200 },
    { id: "4", type: "transfer" as const, date: "2026-10-03", accountId: "a", transferAccountId: "b", amountPaise: 50 },
    { id: "5", type: "income" as const, date: "2026-10-04", accountId: "b", transferAccountId: null, amountPaise: 999 },
  ];

  it("computes the effect of each transaction on an account", () => {
    expect(accountEffect(txns[0], "a")).toBe(-300);
    expect(accountEffect(txns[2], "a")).toBe(200);
    expect(accountEffect(txns[2], "b")).toBe(-200);
    expect(accountEffect(txns[4], "a")).toBe(0);
  });

  it("builds a running-balance statement, oldest first", () => {
    const st = buildStatement(acct, txns);
    expect(st.map((r) => [r.id, r.balancePaise])).toEqual([
      ["1", 1500],
      ["2", 1200],
      ["3", 1400],
      ["4", 1350],
    ]);
    expect(balanceSeries({ date: "2026-09-30", balancePaise: 1000 }, st)).toEqual([
      { date: "2026-09-30", balancePaise: 1000 },
      { date: "2026-10-01", balancePaise: 1500 },
      { date: "2026-10-02", balancePaise: 1200 },
      { date: "2026-10-03", balancePaise: 1350 },
    ]);
  });

  it("colours budgets", () => {
    expect(budgetState(500, 1000)).toEqual({ pct: 50, tone: "good", leftPaise: 500 });
    expect(budgetState(850, 1000).tone).toBe("warn");
    expect(budgetState(1000, 1000).tone).toBe("warn");
    expect(budgetState(1200, 1000)).toEqual({ pct: 120, tone: "bad", leftPaise: -200 });
  });

  it("lists months", () => {
    expect(lastMonths("2026-02-14", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});
