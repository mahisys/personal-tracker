import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bills, borrowers, contacts, invoices, leads, leadStages, lenders, loanFiles, payouts, renewals, tasks, transactions } from "@/db/schema";
import { resetDb } from "@/test/db";
import { addDays, istToInstant } from "@/lib/dates";
import { tasksNeedingYou, plateToday, tasksDoneOn, completionDays } from "./tasks";
import { leadsNeedingYou } from "./leads";
import { billsDueTotal, billsNeedingYou } from "./bills";
import { invoicesExpectedTotal, invoicesNeedingYou } from "./invoices";
import { loanFilesNeedingYou, payoutsExpectedTotal } from "./loan-files";
import { renewalsNeedingYou } from "./renewals";
import { cashInHand, getComingUp, getNeedsYou, sortNeeds } from "./index";
import { computeStreak } from "./streak";

const TODAY = "2026-10-14";
const NOW = istToInstant(TODAY, "10:00");

async function stage(kind: "open" | "won") {
  const [s] = await db.select().from(leadStages).where(eq(leadStages.kind, kind)).limit(1);
  return s;
}

describe("today queries", () => {
  beforeEach(resetDb);

  it("finds tasks due today and overdue, but not future or done ones", async () => {
    await db.insert(tasks).values([
      { workspace: "mahisys", title: "Overdue", dueDate: "2026-10-12", priority: 2 },
      { workspace: "personal", title: "Today", dueDate: TODAY, dueTime: "15:30" },
      { workspace: "mahisys", title: "Tomorrow", dueDate: "2026-10-15" },
      { workspace: "mahisys", title: "Done", dueDate: TODAY, status: "done", completedAt: NOW },
    ]);
    const all = await tasksNeedingYou(null, TODAY);
    expect(all.map((t) => t.title)).toEqual(["Overdue", "Today"]);
    expect(all[0]).toMatchObject({ overdue: true, context: "Overdue by 2 days" });
    expect(all[1].context).toBe("Due today at 3:30 pm");
    expect((await tasksNeedingYou("personal", TODAY)).map((t) => t.title)).toEqual(["Today"]);

    expect(await tasksDoneOn(null, TODAY)).toBe(1);
    expect(await plateToday(null, TODAY)).toMatchObject({ count: 2, dueTodayCount: 1 });
  });

  it("finds leads to follow up (due, overdue, or never planned) in open stages only", async () => {
    const open = await stage("open");
    const won = await stage("won");
    const [c] = await db.insert(contacts).values({ workspace: "mahisys", name: "Asha", phone: "+919800000000" }).returning();
    await db.insert(leads).values([
      { workspace: "mahisys", title: "Due today", stageId: open.id, contactId: c.id, nextFollowUpAt: istToInstant(TODAY, "18:00") },
      { workspace: "mahisys", title: "Late", stageId: open.id, nextFollowUpAt: istToInstant("2026-10-10", "11:00") },
      { workspace: "mahisys", title: "Unplanned", stageId: open.id },
      { workspace: "mahisys", title: "Next week", stageId: open.id, nextFollowUpAt: istToInstant("2026-10-20", "11:00") },
      { workspace: "mahisys", title: "Won already", stageId: won.id, nextFollowUpAt: istToInstant("2026-10-10", "11:00") },
    ]);
    const rows = await leadsNeedingYou(null, TODAY);
    expect(rows.map((r) => r.title).sort()).toEqual(["Due today", "Late", "Unplanned"]);
    const due = rows.find((r) => r.title === "Due today")!;
    expect(due).toMatchObject({ phone: "+919800000000", overdue: false, date: TODAY, href: `/crm/leads/${due.id}` });
    expect(rows.find((r) => r.title === "Late")).toMatchObject({ overdue: true });
    expect(rows.find((r) => r.title === "Unplanned")).toMatchObject({ date: null, overdue: false });
    expect(await leadsNeedingYou("personal", TODAY)).toEqual([]);
  });

  it("finds bills due within 3 days and totals the week", async () => {
    await db.insert(bills).values([
      { workspace: "personal", title: "Rent", amountPaise: 2_000_000, dueDate: "2026-10-13" },
      { workspace: "personal", title: "Internet", amountPaise: 100_000, dueDate: "2026-10-17" },
      { workspace: "personal", title: "Insurance", amountPaise: 500_000, dueDate: "2026-10-20" },
      { workspace: "personal", title: "Later", amountPaise: 900_000, dueDate: "2026-10-30" },
      { workspace: "personal", title: "Paid", amountPaise: 100_000, dueDate: TODAY, status: "paid" },
    ]);
    const rows = await billsNeedingYou(null, TODAY, 3);
    expect(rows.map((r) => r.title)).toEqual(["Rent", "Internet"]);
    expect(rows[0].overdue).toBe(true);
    expect(await billsDueTotal(null, TODAY, 7)).toEqual({ totalPaise: 2_600_000, count: 3 });
  });

  it("finds overdue invoices with a balance and totals money expected", async () => {
    const billTo = { name: "Acme" };
    await db.insert(invoices).values([
      { workspace: "mahisys", number: "MS-1", billTo, issueDate: "2026-09-01", dueDate: "2026-10-01", status: "sent", totalPaise: 1_000_000 },
      { workspace: "mahisys", number: "MS-2", billTo, issueDate: "2026-09-01", dueDate: "2026-10-01", status: "part_paid", totalPaise: 1_000_000, paidPaise: 400_000 },
      { workspace: "mahisys", number: "MS-3", billTo, issueDate: "2026-09-01", dueDate: "2026-10-01", status: "draft", totalPaise: 1_000_000 },
      { workspace: "mahisys", number: "MS-4", billTo, issueDate: "2026-09-01", dueDate: "2026-10-01", status: "paid", totalPaise: 1_000_000, paidPaise: 1_000_000 },
      { workspace: "mahisys", number: "MS-5", billTo, issueDate: "2026-10-01", dueDate: "2026-10-18", status: "sent", totalPaise: 300_000 },
      { workspace: "mahisys", number: "MS-6", billTo, issueDate: "2026-10-01", dueDate: "2026-11-30", status: "sent", totalPaise: 300_000 },
    ]);
    const rows = await invoicesNeedingYou(null, TODAY);
    expect(rows.map((r) => r.title)).toEqual(["MS-1 · Acme", "MS-2 · Acme"]);
    expect(rows[1].amountPaise).toBe(600_000);
    expect(await invoicesExpectedTotal(null, addDays(TODAY, 7))).toEqual({ totalPaise: 1_900_000, count: 3 });
  });

  it("finds loan files needing a nudge and expected payouts", async () => {
    const [b] = await db.insert(borrowers).values({ name: "Ravi", phone: "9811111111" }).returning();
    const [l] = await db.insert(lenders).values({ name: "HDFC" }).returning();
    const old = new Date(NOW.getTime() - 8 * 86_400_000);
    const files = await db
      .insert(loanFiles)
      .values([
        { borrowerId: b.id, lenderId: l.id, product: "home_loan", stage: "logged_in", pendingWith: "lender", stageChangedAt: old },
        { borrowerId: b.id, product: "personal_loan", stage: "documents", pendingWith: "customer", stageChangedAt: NOW, nextFollowUpAt: istToInstant(TODAY, "12:00") },
        { borrowerId: b.id, product: "lap", stage: "documents", pendingWith: "none", stageChangedAt: old },
        { borrowerId: b.id, product: "car_loan", stage: "rejected", pendingWith: "lender", stageChangedAt: old },
        { borrowerId: b.id, product: "business_loan", stage: "sanctioned", pendingWith: "me", stageChangedAt: NOW },
      ])
      .returning();
    const rows = await loanFilesNeedingYou(null, TODAY, NOW);
    expect(rows.map((r) => r.id).sort()).toEqual([files[0].id, files[1].id].sort());
    const stale = rows.find((r) => r.id === files[0].id)!;
    expect(stale.context).toContain("With lender for 8 days");
    expect(stale).toMatchObject({ workspace: "dsa", phone: "9811111111", href: `/dsa/files/${files[0].id}` });
    expect(await loanFilesNeedingYou("mahisys", TODAY, NOW)).toEqual([]);

    await db.insert(payouts).values([
      { loanFileId: files[4].id, grossPaise: 100_000, tdsPaise: 2_000, expectedDate: "2026-10-16" },
      { loanFileId: files[4].id, grossPaise: 50_000, status: "received", expectedDate: "2026-10-16" },
      { loanFileId: files[4].id, grossPaise: 70_000, expectedDate: "2026-11-30" },
    ]);
    expect(await payoutsExpectedTotal(null, addDays(TODAY, 7))).toEqual({ totalPaise: 98_000, count: 1 });
    expect(await payoutsExpectedTotal("personal", addDays(TODAY, 7))).toEqual({ totalPaise: 0, count: 0 });
  });

  it("finds renewals inside their reminder window", async () => {
    await db.insert(renewals).values([
      { workspace: "personal", name: "Car insurance", expiresOn: "2026-11-01", remindDaysBefore: 30 },
      { workspace: "personal", name: "Passport", expiresOn: "2027-06-01", remindDaysBefore: 90 },
      { workspace: "personal", name: "PUC", expiresOn: "2026-10-10", remindDaysBefore: 7 },
      { workspace: "personal", name: "Renewed", expiresOn: "2026-10-20", remindDaysBefore: 30, renewedAt: NOW },
    ]);
    const rows = await renewalsNeedingYou(null, TODAY);
    expect(rows.map((r) => r.title)).toEqual(["Renew PUC", "Renew Car insurance"]);
    expect(rows[0].overdue).toBe(true);
  });

  it("assembles one prioritised list with overdue items first and dedupes Coming up", async () => {
    const open = await stage("open");
    await db.insert(tasks).values([
      { workspace: "mahisys", title: "Today P1", dueDate: TODAY, priority: 1 },
      { workspace: "mahisys", title: "Old task", dueDate: "2026-10-01" },
      { workspace: "mahisys", title: "Friday", dueDate: "2026-10-16" },
    ]);
    await db.insert(bills).values({ workspace: "personal", title: "Phone bill", amountPaise: 50_000, dueDate: "2026-10-16" });
    await db.insert(leads).values({ workspace: "mahisys", title: "Call back", stageId: open.id, nextFollowUpAt: istToInstant(TODAY, "09:00") });

    const needs = await getNeedsYou(null, TODAY, NOW);
    expect(needs.map((n) => n.title)).toEqual(["Old task", "Today P1", "Call back", "Phone bill"]);

    const coming = await getComingUp(null, TODAY, new Set(needs.map((n) => n.key)));
    const titles = coming.flatMap((d) => d.items.map((i) => i.title));
    expect(titles).toContain("Friday");
    expect(titles).not.toContain("Phone bill");
  });

  it("sorts undated items last", () => {
    const base = { workspace: "mahisys" as const, href: "#", context: "" };
    const sorted = sortNeeds([
      { ...base, key: "a", kind: "lead", id: "a", title: "No date", date: null, overdue: false },
      { ...base, key: "b", kind: "task", id: "b", title: "Today", date: TODAY, overdue: false },
      { ...base, key: "c", kind: "bill", id: "c", title: "Late bill", date: "2026-10-10", overdue: true },
    ]);
    expect(sorted.map((s) => s.title)).toEqual(["Late bill", "Today", "No date"]);
  });

  it("computes cash in hand from liquid accounts in the workspace", async () => {
    const [bank] = await db.insert(accounts).values({ name: "HDFC", type: "bank", openingBalancePaise: 1_000_000, openingDate: "2026-01-01", workspace: "mahisys" }).returning();
    await db.insert(accounts).values({ name: "Card", type: "credit_card", openingBalancePaise: -500_000, openingDate: "2026-01-01" });
    await db.insert(accounts).values({ name: "Personal", type: "bank", openingBalancePaise: 300_000, openingDate: "2026-01-01", workspace: "personal" });
    await db.insert(transactions).values({ workspace: "mahisys", type: "expense", date: "2026-10-01", accountId: bank.id, amountPaise: 200_000 });
    expect(await cashInHand(null)).toBe(1_100_000);
    expect(await cashInHand("mahisys")).toBe(800_000);
  });

  it("computes a streak from completion days in IST", async () => {
    // 2026-10-13 23:00 IST is still the 13th in India even though it is the 13th 17:30 UTC
    await db.insert(tasks).values([
      { workspace: "mahisys", title: "a", status: "done", completedAt: istToInstant("2026-10-13", "23:00") },
      { workspace: "mahisys", title: "b", status: "done", completedAt: istToInstant("2026-10-12", "00:30") },
      { workspace: "mahisys", title: "c", status: "done", completedAt: istToInstant(TODAY, "08:00") },
    ]);
    const days = await completionDays(null, TODAY);
    expect(days.sort()).toEqual(["2026-10-12", "2026-10-13", TODAY]);
    expect(computeStreak(days, TODAY)).toMatchObject({ days: 3, activeToday: true });
  });
});
