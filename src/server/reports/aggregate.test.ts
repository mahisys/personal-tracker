import { describe, expect, it } from "vitest";
import {
  ageingBucket,
  budgetVsActual,
  estimateAccuracy,
  expensesByCategory,
  fyMonths,
  fyStartYear,
  gstSummary,
  mondayOf,
  profitAndLoss,
  receivablesAgeing,
  timeReport,
} from "./aggregate";
import { toISTDate } from "@/lib/dates";

describe("financial year", () => {
  it("runs April to March", () => {
    const m = fyMonths(2026);
    expect(m[0]).toBe("2026-04");
    expect(m[11]).toBe("2027-03");
    expect(fyStartYear("2027-03-31")).toBe(2026);
    expect(fyStartYear("2026-04-01")).toBe(2026);
  });
});

describe("profit and loss", () => {
  it("sums by month and workspace, ignoring transfers and other FYs", () => {
    const p = profitAndLoss(
      [
        { date: "2026-04-05", workspace: "mahisys", type: "income", amountPaise: 100_000 },
        { date: "2026-04-20", workspace: "personal", type: "expense", amountPaise: 30_000 },
        { date: "2026-05-01", workspace: "dsa", type: "income", amountPaise: 50_000 },
        { date: "2026-05-02", workspace: "dsa", type: "transfer", amountPaise: 999_999 },
        { date: "2026-03-31", workspace: "mahisys", type: "income", amountPaise: 777 }, // previous FY
        { date: "2027-03-31", workspace: "mahisys", type: "expense", amountPaise: 10_000 },
      ],
      2026,
    );
    expect(p.months[0]).toMatchObject({ month: "2026-04", income: 100_000, expense: 30_000, net: 70_000 });
    expect(p.months[0].byWorkspace.personal).toEqual({ income: 0, expense: 30_000, net: -30_000 });
    expect(p.months[1].byWorkspace.dsa.income).toBe(50_000);
    expect(p.months[11].expense).toBe(10_000);
    expect(p.total).toEqual({ income: 150_000, expense: 40_000, net: 110_000 });
    expect(p.byWorkspace.mahisys.net).toBe(90_000);
  });
});

describe("expenses by category", () => {
  it("sorts, shares and folds the tail into Other", () => {
    const r = expensesByCategory(
      [
        { categoryId: "a", categoryName: "Rent", amountPaise: 500 },
        { categoryId: "b", categoryName: "Food", amountPaise: 300 },
        { categoryId: "a", categoryName: "Rent", amountPaise: 100 },
        { categoryId: null, categoryName: null, amountPaise: 50 },
        { categoryId: "c", categoryName: "Fuel", amountPaise: 50 },
      ],
      2,
    );
    expect(r.totalPaise).toBe(1000);
    expect(r.slices.map((s) => s.name)).toEqual(["Rent", "Food", "Other (2)"]);
    expect(r.slices[0].share).toBe(60);
    expect(r.slices[2].amountPaise).toBe(100);
  });
});

describe("receivables ageing", () => {
  it("buckets by days past due", () => {
    expect(ageingBucket("2026-10-15", "2026-10-14")).toBe("not_due");
    expect(ageingBucket("2026-10-14", "2026-10-14")).toBe("0_30");
    expect(ageingBucket("2026-09-14", "2026-10-14")).toBe("0_30"); // 30 days
    expect(ageingBucket("2026-09-13", "2026-10-14")).toBe("31_60");
    expect(ageingBucket("2026-07-16", "2026-10-14")).toBe("61_90"); // 90
    expect(ageingBucket("2026-07-15", "2026-10-14")).toBe("90_plus");
  });
  it("totals balances per bucket and per client, skipping paid", () => {
    const r = receivablesAgeing(
      [
        { id: "1", number: "A", client: "Acme", clientKey: "c1", dueDate: "2026-10-20", totalPaise: 1000, paidPaise: 0 },
        { id: "2", number: "B", client: "Acme", clientKey: "c1", dueDate: "2026-08-01", totalPaise: 1000, paidPaise: 400 },
        { id: "3", number: "C", client: "Beta", clientKey: "c2", dueDate: "2026-01-01", totalPaise: 5000, paidPaise: 0 },
        { id: "4", number: "D", client: "Beta", clientKey: "c2", dueDate: "2026-01-01", totalPaise: 5000, paidPaise: 5000 },
      ],
      "2026-10-14",
    );
    expect(r.totals).toEqual({ not_due: 1000, "0_30": 0, "31_60": 0, "61_90": 600, "90_plus": 5000 });
    expect(r.totalPaise).toBe(6600);
    expect(r.overduePaise).toBe(5600);
    expect(r.clients[0]).toMatchObject({ name: "Beta", totalPaise: 5000, invoices: 1 });
    expect(r.clients[1]).toMatchObject({ name: "Acme", totalPaise: 1600, invoices: 2 });
  });
});

describe("GST summary", () => {
  it("nets output against input per month", () => {
    const g = gstSummary(
      [
        { issueDate: "2026-04-10", subtotalPaise: 100_000, cgstPaise: 9_000, sgstPaise: 9_000, igstPaise: 0 },
        { issueDate: "2026-04-25", subtotalPaise: 50_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 9_000 },
        { issueDate: "2026-05-02", subtotalPaise: 10_000, cgstPaise: 900, sgstPaise: 900, igstPaise: 0 },
      ],
      [
        { date: "2026-04-11", gstPaise: 5_000 },
        { date: "2026-05-11", gstPaise: 4_000 },
      ],
      fyMonths(2026),
    );
    expect(g.months[0]).toMatchObject({ taxablePaise: 150_000, outputPaise: 27_000, inputPaise: 5_000, netPaise: 22_000 });
    expect(g.months[1]).toMatchObject({ outputPaise: 1_800, inputPaise: 4_000, netPaise: -2_200 });
    expect(g.total).toMatchObject({ outputPaise: 28_800, inputPaise: 9_000, netPaise: 19_800, igstPaise: 9_000 });
  });
});

describe("budget vs actual", () => {
  it("only budgeted categories, scaled by months, with status", () => {
    const lines = budgetVsActual(
      [
        { id: "a", name: "Food", monthlyBudgetPaise: 1000 },
        { id: "b", name: "Fuel", monthlyBudgetPaise: 500 },
        { id: "c", name: "Rent", monthlyBudgetPaise: null },
      ],
      new Map([
        ["a", 900],
        ["b", 600],
      ]),
    );
    expect(lines.map((l) => [l.name, l.pct, l.status])).toEqual([
      ["Fuel", 120, "over"],
      ["Food", 90, "near"],
    ]);
    expect(budgetVsActual([{ id: "a", name: "Food", monthlyBudgetPaise: 1000 }], new Map([["a", 900]]), 3)[0]).toMatchObject({ budgetPaise: 3000, status: "under" });
  });
});

describe("time report", () => {
  it("groups minutes into IST weeks, workspaces and projects", () => {
    const today = "2026-10-14"; // Wednesday
    expect(mondayOf(today)).toBe("2026-10-12");
    const r = timeReport(
      [
        { startedAt: new Date("2026-10-12T03:00:00Z"), minutes: 60, workspace: "mahisys", projectId: "p1", projectName: "Website" },
        { startedAt: new Date("2026-10-11T19:00:00Z"), minutes: 30, workspace: "mahisys", projectId: "p1", projectName: "Website" }, // 00:30 IST Monday
        { startedAt: new Date("2026-10-05T05:00:00Z"), minutes: 45, workspace: "dsa", projectId: null, projectName: null },
        { startedAt: new Date("2026-08-01T05:00:00Z"), minutes: 999, workspace: "dsa", projectId: null, projectName: null }, // too old
      ],
      4,
      today,
      toISTDate,
    );
    expect(r.series).toHaveLength(4);
    expect(r.series[3]).toMatchObject({ week: "2026-10-12", mahisys: 90 });
    expect(r.series[2]).toMatchObject({ week: "2026-10-05", dsa: 45 });
    expect(r.total).toBe(135);
    expect(r.projects[0]).toMatchObject({ name: "Website", minutes: 90 });
  });
});

describe("estimate accuracy", () => {
  it("computes actual/estimate per type with verdicts", () => {
    const r = estimateAccuracy([
      { taskType: "development", estimateMinutes: 60, actualMinutes: 90 },
      { taskType: "development", estimateMinutes: 60, actualMinutes: 60 },
      { taskType: "sales call", estimateMinutes: 30, actualMinutes: 30 },
      { taskType: null, estimateMinutes: 100, actualMinutes: 50 },
      { taskType: "x", estimateMinutes: 0, actualMinutes: 50 },
    ]);
    expect(r.lines[0]).toMatchObject({ taskType: "development", tasks: 2, ratio: 1.25, verdict: "under" });
    expect(r.lines.find((l) => l.taskType === "sales call")?.verdict).toBe("spot_on");
    expect(r.lines.find((l) => l.taskType === "Untyped")?.verdict).toBe("over");
    expect(r.overall).toMatchObject({ tasks: 4, estimateMinutes: 250, actualMinutes: 230 });
  });
});
