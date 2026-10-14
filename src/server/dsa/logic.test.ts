import { describe, expect, it } from "vitest";
import { defaultChecklist } from "./constants";
import {
  approvalStats,
  avgLoginToDisbursal,
  computePayout,
  daysWaiting,
  expectedPayoutDate,
  findPayoutRate,
  funnel,
  furthestStageIndex,
  groupPendency,
  lastMonths,
  monthlyEarnings,
  payoutBreakdown,
  stageStaleness,
  totals,
  type GridRow,
} from "./logic";
import { istToInstant } from "@/lib/dates";

const L = "lender-1";
const lakh = (n: number) => n * 100_000 * 100;

describe("findPayoutRate", () => {
  const grid: GridRow[] = [
    { id: "open", lenderId: L, product: "home_loan", minTicketPaise: 0, maxTicketPaise: null, rateBps: 35 },
    { id: "mid", lenderId: L, product: "home_loan", minTicketPaise: lakh(30), maxTicketPaise: lakh(75), rateBps: 50 },
    { id: "big", lenderId: L, product: "home_loan", minTicketPaise: lakh(75), maxTicketPaise: null, rateBps: 60 },
    { id: "pl", lenderId: L, product: "personal_loan", minTicketPaise: 0, maxTicketPaise: lakh(10), rateBps: 200 },
    { id: "other", lenderId: "x", product: "home_loan", minTicketPaise: 0, maxTicketPaise: null, rateBps: 99 },
  ];

  it("picks the narrowest matching range", () => {
    expect(findPayoutRate(grid, L, "home_loan", lakh(50))?.id).toBe("mid");
  });
  it("falls back to an open-ended row", () => {
    expect(findPayoutRate(grid, L, "home_loan", lakh(10))?.id).toBe("open");
  });
  it("treats bounds as inclusive and prefers the higher minimum between open rows", () => {
    expect(findPayoutRate(grid, L, "home_loan", lakh(75))?.id).toBe("mid");
    expect(findPayoutRate(grid, L, "home_loan", lakh(80))?.id).toBe("big");
  });
  it("respects lender and product", () => {
    expect(findPayoutRate(grid, L, "personal_loan", lakh(5))?.rateBps).toBe(200);
    expect(findPayoutRate(grid, L, "personal_loan", lakh(15))).toBeNull();
    expect(findPayoutRate(grid, L, "car_loan", lakh(5))).toBeNull();
  });
});

describe("payout amounts", () => {
  it("computes gross, GST, TDS, net and sub-connector share", () => {
    // ₹50L at 0.5% = ₹25,000 gross; 18% GST = 4,500; 2% TDS = 500; 25% share = 6,250
    const p = computePayout(lakh(50), 50, { gstBps: 1800, tdsBps: 200, subShareBps: 2500 });
    expect(p.grossPaise).toBe(2_500_000);
    expect(p.gstPaise).toBe(450_000);
    expect(p.tdsPaise).toBe(50_000);
    expect(p.netPaise).toBe(2_900_000);
    expect(p.subConnectorSharePaise).toBe(625_000);
    expect(p.inHandPaise).toBe(2_500_000 - 50_000 - 625_000);
  });
  it("is zero when there is no rate", () => {
    const p = computePayout(lakh(10), null, { gstBps: 0, tdsBps: 200 });
    expect(p).toMatchObject({ grossPaise: 0, tdsPaise: 0, netPaise: 0, subConnectorSharePaise: 0 });
  });
  it("rounds to the nearest paisa", () => {
    const p = payoutBreakdown(12_345, { gstBps: 0, tdsBps: 200 });
    expect(p.tdsPaise).toBe(247);
    expect(p.netPaise).toBe(12_098);
  });
  it("adds payout days to the disbursal date", () => {
    expect(expectedPayoutDate("2026-10-20", 30)).toBe("2026-11-19");
  });
});

describe("staleness", () => {
  const today = "2026-10-14";
  it("uses IST calendar days", () => {
    // 11 Oct 23:00 IST is 11 Oct; 3 days in "lead" (limit 2) → over
    const at = istToInstant("2026-10-11", "23:00");
    expect(stageStaleness("lead", at, today)).toMatchObject({ days: 3, limit: 2, level: "over", overBy: 1 });
  });
  it("is way over at twice the limit", () => {
    expect(stageStaleness("lead", istToInstant("2026-10-10"), today).level).toBe("way_over");
    expect(stageStaleness("documents", istToInstant("2026-10-10"), today).level).toBe("fresh");
  });
  it("never goes stale in a stage without a limit", () => {
    expect(stageStaleness("payout_received", istToInstant("2025-01-01"), today).level).toBe("fresh");
  });
  it("waits from the later of stage change and pending change", () => {
    const f = { id: "a", pendingWith: "customer" as const, stageChangedAt: istToInstant("2026-10-01"), pendingSince: istToInstant("2026-10-10") };
    expect(daysWaiting(f, today)).toBe(4);
    expect(daysWaiting({ ...f, pendingSince: null }, today)).toBe(13);
  });
  it("groups pendency longest-waiting first", () => {
    const g = groupPendency(
      [
        { id: "a", pendingWith: "lender" as const, stageChangedAt: istToInstant("2026-10-12") },
        { id: "b", pendingWith: "lender" as const, stageChangedAt: istToInstant("2026-10-01") },
        { id: "c", pendingWith: "me" as const, stageChangedAt: istToInstant("2026-10-13") },
      ],
      today,
      ["me", "customer", "lender", "valuation_legal", "none"],
    );
    expect(g.map((x) => x.key)).toEqual(["me", "customer", "lender", "valuation_legal", "none"]);
    expect(g[2].files.map((f) => f.id)).toEqual(["b", "a"]);
    expect(g[2].files[0].waiting).toBe(13);
  });
});

describe("checklists", () => {
  it("salaried personal loan", () => {
    const c = defaultChecklist("personal_loan", "salaried");
    expect(c).toContain("PAN card");
    expect(c).toContain("Salary slips — last 3 months");
    expect(c).toContain("Form 16 — last 2 years");
    expect(c.some((d) => d.includes("ITR"))).toBe(false);
  });
  it("self-employed home loan adds ITR and property papers", () => {
    const c = defaultChecklist("home_loan", "business");
    expect(c.some((d) => d.startsWith("ITR"))).toBe(true);
    expect(c.some((d) => d.startsWith("GST returns"))).toBe(true);
    expect(c).toContain("Approved building plan");
    expect(c).toContain("OC / CC (occupancy / completion certificate)");
    expect(c.some((d) => d.startsWith("Salary slips"))).toBe(false);
  });
  it("car loan has a quotation; education loan uses co-applicant", () => {
    expect(defaultChecklist("car_loan", "salaried")).toContain("Vehicle quotation / proforma invoice");
    const edu = defaultChecklist("education_loan", "salaried");
    expect(edu).toContain("Admission / offer letter");
    expect(edu).toContain("Co-applicant income proof");
    expect(edu.some((d) => d.startsWith("Salary slips"))).toBe(false);
  });
  it("has no duplicates", () => {
    const c = defaultChecklist("lap", "self_employed");
    expect(new Set(c).size).toBe(c.length);
  });
});

describe("funnel and approval", () => {
  const files = [
    { stage: "lead" as const },
    { stage: "documents" as const },
    { stage: "logged_in" as const },
    { stage: "rejected" as const, history: ["lead", "documents", "logged_in", "rejected"] as const },
    { stage: "disbursed" as const },
    { stage: "payout_received" as const },
    { stage: "dropped" as const, history: ["lead", "dropped"] as const },
  ].map((f) => ({ ...f, history: f.history ? [...f.history] : undefined }));

  it("uses the furthest stage reached", () => {
    expect(furthestStageIndex("rejected", ["lead", "logged_in", "rejected"])).toBe(3);
    expect(furthestStageIndex("dropped", [])).toBe(0);
  });
  it("counts each step", () => {
    const f = funnel(files);
    expect(f.map((s) => s.count)).toEqual([7, 4, 2, 2]);
    expect(f[1].pct).toBe(57);
  });
  it("approval rate ignores dropped and undecided files", () => {
    expect(approvalStats(files)).toEqual({ approved: 2, rejected: 1, decided: 3, rate: 67 });
    expect(approvalStats([{ stage: "lead" }]).rate).toBeNull();
  });
  it("averages login to disbursal days", () => {
    expect(
      avgLoginToDisbursal([
        { loginDate: "2026-09-01", disbursalDate: "2026-09-21" },
        { loginDate: "2026-09-01", disbursalDate: "2026-09-11" },
        { loginDate: "2026-09-01", disbursalDate: null },
      ]),
    ).toBe(15);
    expect(avgLoginToDisbursal([])).toBeNull();
  });
});

describe("earnings", () => {
  it("lists the last 12 months across a year boundary", () => {
    const m = lastMonths("2026-02-10", 12);
    expect(m[0]).toBe("2025-03");
    expect(m[11]).toBe("2026-02");
  });
  it("buckets gross and in-hand by disbursal month", () => {
    const rows = [
      { disbursalDate: "2026-10-02", grossPaise: 10_000, gstPaise: 1_800, tdsPaise: 200, subConnectorSharePaise: 1_000 },
      { disbursalDate: "2026-10-20", grossPaise: 5_000, gstPaise: 0, tdsPaise: 100, subConnectorSharePaise: 0 },
      { disbursalDate: "2024-01-01", grossPaise: 99_999, gstPaise: 0, tdsPaise: 0, subConnectorSharePaise: 0 },
      { disbursalDate: null, grossPaise: 1, gstPaise: 0, tdsPaise: 0, subConnectorSharePaise: 0 },
    ];
    const m = monthlyEarnings(rows, "2026-10-14");
    expect(m).toHaveLength(12);
    expect(m[11]).toEqual({ month: "2026-10", gross: 15_000, net: 13_700 });
    expect(totals(rows.slice(0, 2))).toMatchObject({ gross: 15_000, gst: 1_800, tds: 300, net: 16_500, sub: 1_000, inHand: 13_700 });
  });
});
