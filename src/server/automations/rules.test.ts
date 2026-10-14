import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/planner/forecast", () => ({ getCashForecast: vi.fn() }));

import { decideBillReminder, type BillLite } from "./rules/bill-reminders";
import { decideLeadFollowup, decideStaleLead } from "./rules/leads";
import { decideInvoiceOverdue, reminderMessage, type InvoiceLite } from "./rules/invoices";
import { chaseTarget, decidePayoutChase, decideStaleFile, stageLimits } from "./rules/dsa";
import { decideCashWarning } from "./rules/cash-warning";
import { decideRenewal } from "./rules/renewals";
import { decideCatchup, type SeriesInstance } from "./rules/recurring";
import { buildDigest, isDigestDue, type DigestData } from "./rules/digest";
import { buildWeekly, isWeeklyReviewDue } from "./rules/weekly";
import { isAtOrAfter, normaliseTime, weekStart } from "./types";
import { listConfig, mergeConfig } from "./meta";
import { istToInstant } from "@/lib/dates";

const bill = (o: Partial<BillLite> = {}): BillLite => ({
  id: "b1",
  title: "Office rent",
  payee: "Landlord",
  amountPaise: 2_500_000,
  dueDate: "2026-10-20",
  remindDaysBefore: [3, 1],
  workspace: "mahisys",
  ...o,
});

describe("time helpers", () => {
  it("compares IST clock times and normalises input", () => {
    expect(isAtOrAfter("08:00", "08:00")).toBe(true);
    expect(isAtOrAfter("07:59", "8:00")).toBe(false);
    expect(normaliseTime("7:5")).toBe("08:00");
    expect(normaliseTime("7:05")).toBe("07:05");
    expect(normaliseTime("25:00")).toBe("08:00");
  });
  it("weekStart is the Monday", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-12"); // Wednesday
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday
  });
  it("digest is due at or after digest time (IST)", () => {
    expect(isDigestDue("07:45", "08:00")).toBe(false);
    expect(isDigestDue("08:00", "08:00")).toBe(true);
    expect(isDigestDue("23:59", "08:00")).toBe(true);
  });
  it("weekly review is due on the review weekday from 18:00 IST", () => {
    // 2026-10-18 is a Sunday
    expect(isWeeklyReviewDue("2026-10-18", "17:59", 0)).toBe(false);
    expect(isWeeklyReviewDue("2026-10-18", "18:00", 0)).toBe(true);
    expect(isWeeklyReviewDue("2026-10-17", "19:00", 0)).toBe(false);
    expect(isWeeklyReviewDue("2026-10-17", "19:00", 6)).toBe(true);
  });
});

describe("config helpers", () => {
  it("merges nested stage limits over defaults", () => {
    const c = mergeConfig("dsa_stale_files", { stageLimits: { documents: 9 } });
    expect(stageLimits(c)).toMatchObject({ lead: 2, documents: 9, payout_invoiced: 30 });
  });
  it("parses list config from strings or arrays", () => {
    expect(listConfig({ days: "15, 1,7, x" }, "days", [1])).toEqual([1, 7, 15]);
    expect(listConfig({ days: [] }, "days", [1, 7])).toEqual([1, 7]);
  });
});

describe("bill reminders", () => {
  it("fires the 3-day window and dedupes per window", () => {
    const r = decideBillReminder(bill(), "2026-10-17");
    expect(r?.kind).toBe("bill_due");
    expect(r?.dedupeKey).toBe("bill_due:b1:2026-10-20:3");
    expect(r?.title).toContain("₹25,000 due to Landlord in 3 days");
  });
  it("catches up a missed window (2 days left → 3-day window)", () => {
    expect(decideBillReminder(bill(), "2026-10-18")?.dedupeKey).toBe("bill_due:b1:2026-10-20:3");
  });
  it("fires 1 day before and on the day", () => {
    expect(decideBillReminder(bill(), "2026-10-19")?.title).toContain("tomorrow");
    const due = decideBillReminder(bill(), "2026-10-20");
    expect(due?.dedupeKey).toBe("bill_due:b1:2026-10-20:0");
    expect(due?.title).toContain("today");
  });
  it("stays quiet outside the windows", () => {
    expect(decideBillReminder(bill(), "2026-10-10")).toBeNull();
  });
  it("overdue: daily for 3 days, then weekly, deduped per day", () => {
    const o = decideBillReminder(bill(), "2026-10-21");
    expect(o?.kind).toBe("bill_overdue");
    expect(o?.dedupeKey).toBe("bill_overdue:b1:2026-10-21");
    expect(decideBillReminder(bill(), "2026-10-25")).toBeNull(); // 5 days late
    expect(decideBillReminder(bill(), "2026-10-27")?.kind).toBe("bill_overdue"); // 7 days late
  });
  it("uses the title when there is no payee", () => {
    expect(decideBillReminder(bill({ payee: null }), "2026-10-19")?.title).toContain("Office rent");
  });
});

describe("lead follow-ups", () => {
  const now = istToInstant("2026-10-14", "10:00");
  const base = { now, today: "2026-10-14", time: "10:00", remindMissing: true, missingAfter: "08:00" };
  it("fires when the follow-up time has passed, once per IST day", () => {
    const r = decideLeadFollowup({ id: "l1", title: "Acme website", nextFollowUpAt: istToInstant("2026-10-14", "09:30") }, base);
    expect(r?.dedupeKey).toBe("lead_followup:l1:2026-10-14");
    expect(r?.title).toBe("Follow up: Acme website");
  });
  it("waits for a future follow-up", () => {
    expect(decideLeadFollowup({ id: "l1", title: "x", nextFollowUpAt: istToInstant("2026-10-14", "11:00") }, base)).toBeNull();
  });
  it("reminds about missing follow-ups only after the morning time, and only when enabled", () => {
    expect(decideLeadFollowup({ id: "l1", title: "x", nextFollowUpAt: null }, base)?.title).toContain("Plan the next step");
    expect(decideLeadFollowup({ id: "l1", title: "x", nextFollowUpAt: null }, { ...base, time: "07:00" })).toBeNull();
    expect(decideLeadFollowup({ id: "l1", title: "x", nextFollowUpAt: null }, { ...base, remindMissing: false })).toBeNull();
  });
  it("stale leads use last activity or creation, in IST days", () => {
    const created = istToInstant("2026-10-01", "12:00");
    expect(decideStaleLead({ lastActivityAt: null, createdAt: created }, "2026-10-08", 7)).toBe(7);
    expect(decideStaleLead({ lastActivityAt: istToInstant("2026-10-10", "23:30"), createdAt: created }, "2026-10-14", 7)).toBeNull();
    // 23:30 IST on the 7th is the 7th in IST even though it is the 7th 18:00 UTC
    expect(decideStaleLead({ lastActivityAt: istToInstant("2026-10-07", "23:30"), createdAt: created }, "2026-10-14", 7)).toBe(7);
  });
});

describe("invoice overdue", () => {
  const inv: InvoiceLite = { id: "i1", number: "MS-001", dueDate: "2026-10-01", totalPaise: 118_000_00, paidPaise: 0, billTo: { name: "Ravi Kumar" }, workspace: "mahisys" };
  it("hits milestones 1, 7, 15 with catch-up", () => {
    expect(decideInvoiceOverdue(inv, "2026-10-01", [1, 7, 15])).toBeNull();
    expect(decideInvoiceOverdue(inv, "2026-10-02", [1, 7, 15])?.dedupeKey).toBe("invoice_overdue:i1:1");
    expect(decideInvoiceOverdue(inv, "2026-10-05", [1, 7, 15])?.milestone).toBe(1);
    expect(decideInvoiceOverdue(inv, "2026-10-08", [1, 7, 15])?.milestone).toBe(7);
    expect(decideInvoiceOverdue(inv, "2026-10-30", [1, 7, 15])?.dedupeKey).toBe("invoice_overdue:i1:15");
  });
  it("ignores paid-up invoices", () => {
    expect(decideInvoiceOverdue({ ...inv, paidPaise: inv.totalPaise }, "2026-10-08", [1, 7, 15])).toBeNull();
  });
  it("writes a polite reminder", () => {
    const m = reminderMessage(inv, 7, "MahiSys");
    expect(m).toContain("Hi Ravi");
    expect(m).toContain("MS-001");
    expect(m).toContain("₹1,18,000");
  });
});

describe("DSA rules", () => {
  const limits = stageLimits({});
  it("flags a file past its stage limit in IST days", () => {
    expect(decideStaleFile({ stage: "documents", stageChangedAt: istToInstant("2026-10-09", "10:00") }, "2026-10-14", limits)).toBeNull(); // 5 days = limit
    expect(decideStaleFile({ stage: "documents", stageChangedAt: istToInstant("2026-10-08", "10:00") }, "2026-10-14", limits)).toEqual({ days: 6, limit: 5 });
    expect(decideStaleFile({ stage: "payout_received", stageChangedAt: istToInstant("2025-01-01") }, "2026-10-14", limits)).toBeNull();
  });
  it("respects overridden limits", () => {
    const l = stageLimits({ stageLimits: { lead: 10 } });
    expect(decideStaleFile({ stage: "lead", stageChangedAt: istToInstant("2026-10-08") }, "2026-10-14", l)).toBeNull();
  });
  it("chases the RM when the file is with the lender, else the borrower", () => {
    expect(chaseTarget({ pendingWith: "lender", borrowerName: "Asha", lenderName: "HDFC", rmName: "Vikram" })).toBe("Vikram (HDFC)");
    expect(chaseTarget({ pendingWith: "customer", borrowerName: "Asha", lenderName: "HDFC", rmName: "Vikram" })).toBe("Asha");
    expect(chaseTarget({ pendingWith: "lender", borrowerName: "Asha", lenderName: null, rmName: null })).toBe("Asha");
  });
  it("payout is late after the expected date, or disbursal + grace", () => {
    expect(decidePayoutChase({ status: "expected", expectedDate: "2026-10-13", disbursalDate: null }, "2026-10-14")).toEqual({ dueDate: "2026-10-13", daysLate: 1 });
    expect(decidePayoutChase({ status: "expected", expectedDate: "2026-10-14", disbursalDate: null }, "2026-10-14")).toBeNull();
    expect(decidePayoutChase({ status: "invoiced", expectedDate: null, disbursalDate: "2026-09-01" }, "2026-10-14", 30)?.dueDate).toBe("2026-10-01");
    expect(decidePayoutChase({ status: "received", expectedDate: "2026-01-01", disbursalDate: null }, "2026-10-14")).toBeNull();
    expect(decidePayoutChase({ status: "expected", expectedDate: null, disbursalDate: null }, "2026-10-14")).toBeNull();
  });
});

describe("cash warning", () => {
  it("warns once per day with suggestions", () => {
    const w = decideCashWarning(
      {
        lowest: { date: "2026-10-25", balancePaise: -500000 },
        shortfall: { firstDate: "2026-10-22", amountPaise: 1_200_000 },
        suggestions: [{ billId: "b", title: "Laptop EMI", amountPaise: 900000, fromDate: "2026-10-22", toDate: "2026-11-02" }],
      },
      "2026-10-14",
      30,
    );
    expect(w?.dedupeKey).toBe("cash_warning:2026-10-14");
    expect(w?.body).toContain("Laptop EMI");
    expect(w?.body).toContain("₹12,000");
  });
  it("is silent without a shortfall", () => {
    expect(decideCashWarning({ lowest: { date: "2026-10-14", balancePaise: 1 }, shortfall: null, suggestions: [] }, "2026-10-14", 30)).toBeNull();
  });
});

describe("renewals", () => {
  it("fires inside the window with task due a week before expiry (or today)", () => {
    expect(decideRenewal({ expiresOn: "2026-12-31", remindDaysBefore: 30, renewedAt: null }, "2026-10-14")).toBeNull();
    expect(decideRenewal({ expiresOn: "2026-11-10", remindDaysBefore: 30, renewedAt: null }, "2026-10-14")).toEqual({ daysLeft: 27, taskDue: "2026-11-03" });
    expect(decideRenewal({ expiresOn: "2026-10-17", remindDaysBefore: 30, renewedAt: null }, "2026-10-14")).toEqual({ daysLeft: 3, taskDue: "2026-10-14" });
    expect(decideRenewal({ expiresOn: "2026-10-17", remindDaysBefore: 30, renewedAt: new Date() }, "2026-10-14")).toBeNull();
  });
});

describe("recurring catch-up", () => {
  const now = new Date("2026-10-14T06:00:00Z");
  const monthly = { freq: "monthly" as const, interval: 1 };
  const inst = (o: Partial<SeriesInstance>): SeriesInstance => ({ id: "x", open: false, finished: true, dueDate: "2026-10-05", finishedAt: new Date("2026-10-14T04:00:00Z"), recurrence: monthly, ...o });
  it("creates the next date when the series has no open instance", () => {
    expect(decideCatchup([inst({ id: "a", dueDate: "2026-09-05" }), inst({ id: "b" })], now)).toBe("2026-11-05");
  });
  it("keeps the anchor day of the first instance", () => {
    expect(decideCatchup([inst({ id: "a", dueDate: "2026-01-31" }), inst({ id: "b", dueDate: "2026-09-30" })], now)).toBe("2026-10-31");
  });
  it("does nothing when an instance is open, when just finished, or when finished long ago", () => {
    expect(decideCatchup([inst({}), inst({ id: "o", open: true, finished: false, dueDate: "2026-11-05" })], now)).toBeNull();
    expect(decideCatchup([inst({ finishedAt: new Date("2026-10-14T05:55:00Z") })], now)).toBeNull();
    expect(decideCatchup([inst({ finishedAt: new Date("2026-10-01T00:00:00Z") })], now)).toBeNull();
  });
  it("does nothing when cancelled, not recurring, or past until", () => {
    expect(decideCatchup([inst({ finished: false })], now)).toBeNull();
    expect(decideCatchup([inst({ recurrence: null })], now)).toBeNull();
    expect(decideCatchup([inst({ recurrence: { ...monthly, until: "2026-10-31" } })], now)).toBeNull();
  });
});

describe("briefings", () => {
  const data: DigestData = {
    today: "2026-10-14",
    tasksToday: [{ id: "t1", title: "Send proposal", workspace: "mahisys", dueTime: "11:00", priority: 1 }],
    overdueTasks: [{ id: "t2", title: "File GST", workspace: "personal", dueDate: "2026-10-12" }],
    followUps: [{ type: "lead", id: "l1", title: "Acme", at: istToInstant("2026-10-14", "09:00") }],
    bills: [{ id: "b1", title: "Rent", payee: "Landlord", amountPaise: 2_500_000, dueDate: "2026-10-15" }],
    dsaChase: [],
    overdueInvoices: [{ id: "i1", number: "MS-1", client: "Ravi", balancePaise: 500000, dueDate: "2026-10-01" }],
    liquidPaise: 1_000_000,
    minBalancePaise: 2_500_000,
    inThisWeekPaise: 0,
    outThisWeekPaise: 2_500_000,
  };
  it("digest summarises counts, sections and low cash", () => {
    const b = buildDigest(data);
    expect(b.summary).toContain("2 tasks");
    expect(b.summary).toContain("1 follow-up");
    expect(b.sections[0].items[0].tone).toBe("bad"); // overdue first
    expect(b.sections.find((s) => s.heading === "DSA files to chase")?.items).toHaveLength(0);
    expect(b.stats.find((s) => s.label === "Cash on hand")?.tone).toBe("bad");
  });
  it("weekly review computes completion rate and nets", () => {
    const b = buildWeekly({
      from: "2026-10-12",
      to: "2026-10-18",
      planned: 10,
      plannedDone: 8,
      completed: 11,
      minutesByWorkspace: { personal: 60, mahisys: 600, dsa: 0 },
      moneyByWorkspace: { personal: { inPaise: 0, outPaise: 100000 }, mahisys: { inPaise: 5_000_000, outPaise: 0 }, dsa: { inPaise: 0, outPaise: 0 } },
      leadsCreated: 3,
      leadsWon: { count: 1, valuePaise: 5_000_000 },
      leadsLost: 0,
      disbursals: { count: 1, amountPaise: 50_00_000_00 },
      payoutsReceived: { count: 0, amountPaise: 0 },
    });
    expect(b.stats[0]).toMatchObject({ value: "8/10", tone: "good" });
    expect(b.stats[1].value).toBe("11h");
    expect(b.sections[1].items).toHaveLength(2);
    expect(b.summary).toContain("8/10");
  });
});
