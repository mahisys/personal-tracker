import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/planner/forecast", () => ({
  getCashForecast: vi.fn(async () => ({
    startBalancePaise: 100000,
    minBalancePaise: -400000,
    days: [],
    lowest: { date: "2026-10-25", balancePaise: -400000 },
    shortfall: { firstDate: "2026-10-22", amountPaise: 2_900_000 },
    suggestions: [{ billId: "x", title: "Laptop EMI", amountPaise: 900000, fromDate: "2026-10-22", toDate: "2026-11-02" }],
  })),
}));

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRules,
  automationRuns,
  bills,
  borrowers,
  invoices,
  leads,
  leadStages,
  lenders,
  loanFiles,
  notifications,
  payouts,
  renewals,
  tasks,
} from "@/db/schema";
import { resetDb } from "@/test/db";
import { istToInstant } from "@/lib/dates";
import { runAutomations } from "./engine";

const NOW = istToInstant("2026-10-14", "09:00"); // Wednesday, after the 08:00 digest

async function seedScenario() {
  const [open] = await db.select().from(leadStages).where(eq(leadStages.kind, "open")).limit(1);
  await db.insert(leads).values([
    { workspace: "mahisys", title: "Acme website", stageId: open.id, nextFollowUpAt: istToInstant("2026-10-14", "08:30"), lastActivityAt: istToInstant("2026-10-13", "12:00") },
    { workspace: "mahisys", title: "Quiet Co", stageId: open.id, createdAt: istToInstant("2026-09-20", "12:00") },
  ]);
  await db.insert(bills).values({ workspace: "personal", title: "Rent", payee: "Landlord", amountPaise: 2_500_000, dueDate: "2026-10-15" });
  await db.insert(invoices).values({
    workspace: "mahisys",
    number: "MS-001",
    billTo: { name: "Ravi Kumar" },
    issueDate: "2026-09-01",
    dueDate: "2026-10-01",
    status: "sent",
    totalPaise: 11_800_000,
  });
  const [lender] = await db.insert(lenders).values({ name: "HDFC Bank", rmName: "Vikram" }).returning();
  const [borrower] = await db.insert(borrowers).values({ name: "Asha Patil" }).returning();
  const [file] = await db
    .insert(loanFiles)
    .values({ borrowerId: borrower.id, lenderId: lender.id, product: "home_loan", stage: "documents", stageChangedAt: istToInstant("2026-10-01"), pendingWith: "lender" })
    .returning();
  const [file2] = await db
    .insert(loanFiles)
    .values({ borrowerId: borrower.id, lenderId: lender.id, product: "lap", stage: "disbursed", stageChangedAt: istToInstant("2026-10-10"), disbursalDate: "2026-09-01" })
    .returning();
  await db.insert(payouts).values({ loanFileId: file2.id, lenderId: lender.id, status: "expected", expectedDate: "2026-10-05", grossPaise: 5_000_000 });
  await db.insert(renewals).values({ workspace: "personal", name: "Car insurance", expiresOn: "2026-10-30", remindDaysBefore: 30 });
  // A recurring task finished yesterday whose next instance went missing.
  await db.insert(tasks).values({
    workspace: "personal",
    title: "Pay maid",
    status: "done",
    dueDate: "2026-10-13",
    recurrence: { freq: "weekly", interval: 1 },
    completedAt: istToInstant("2026-10-13", "18:00"),
  });
  await db.insert(tasks).values({ workspace: "mahisys", title: "Call Ravi", dueDate: "2026-10-20", remindAt: istToInstant("2026-10-14", "08:50") });
  return { fileId: file.id };
}

async function counts() {
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications);
  const [t] = await db.select({ n: sql<number>`count(*)::int` }).from(tasks);
  return { notifications: n.n, tasks: t.n };
}

describe("runAutomations", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("raises every alert and task once, and is idempotent across runs", async () => {
    const { fileId } = await seedScenario();
    const first = await runAutomations({ now: NOW, trigger: "test" });
    expect(first.ok).toBe(true);
    const byKey = Object.fromEntries(first.rules.map((r) => [r.key, r]));
    expect(byKey.bill_reminders.notifications).toBe(1);
    expect(byKey.lead_followups.notifications).toBe(2); // one passed, one missing
    expect(byKey.stale_leads).toMatchObject({ notifications: 1, tasks: 1 }); // Quiet Co
    expect(byKey.invoice_overdue.notifications).toBe(1);
    expect(byKey.dsa_stale_files).toMatchObject({ notifications: 1, tasks: 1 }); // the disbursed file is within its 30 days
    expect(byKey.payout_chase).toMatchObject({ notifications: 1, tasks: 1 });
    expect(byKey.cash_warning.notifications).toBe(1);
    expect(byKey.renewals).toMatchObject({ notifications: 1, tasks: 1 });
    expect(byKey.recurring_catchup.created).toBe(1);
    expect(byKey.daily_digest.notifications).toBe(1);
    expect(byKey.weekly_review.skipped).toBeTruthy();
    expect(byKey.task_reminders.notifications).toBe(1);

    const chase = await db.select().from(tasks).where(eq(tasks.linkedId, fileId));
    expect(chase[0].title).toBe("Chase Vikram (HDFC Bank): Asha Patil — Documents");
    expect(chase[0].workspace).toBe("dsa");

    const after1 = await counts();
    const second = await runAutomations({ now: new Date(NOW.getTime() + 15 * 60_000), trigger: "test" });
    expect(second.ok).toBe(true);
    expect(second.rules.reduce((s, r) => s + r.notifications + (r.tasks ?? 0), 0)).toBe(0);
    expect(await counts()).toEqual(after1);

    // Records runs and last results
    const runs = await db.select().from(automationRuns);
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.ok && r.finishedAt)).toBe(true);
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.key, "stale_leads"));
    expect(rule.lastRunAt).toBeTruthy();
    expect(rule.lastResult).toBe("All quiet — nothing needed");

    // Push delivery marks rows handled even without devices, so they never burst later
    const unpushed = await db.select().from(notifications).where(sql`${notifications.pushedAt} is null`);
    expect(unpushed).toHaveLength(0);
  });

  it("does not create a second follow-up task the next day while one is open", async () => {
    await seedScenario();
    await runAutomations({ now: NOW, trigger: "test" });
    const before = await counts();
    const next = await runAutomations({ now: istToInstant("2026-10-15", "09:00"), trigger: "test", only: ["stale_leads", "dsa_stale_files"] });
    expect(next.rules.every((r) => (r.tasks ?? 0) === 0)).toBe(true);
    expect((await counts()).tasks).toBe(before.tasks);
  });

  it("skips disabled rules and keeps going when one rule throws", async () => {
    await seedScenario();
    await runAutomations({ now: NOW, trigger: "test", only: [] }); // inserts default rows
    await db.update(automationRules).set({ enabled: false }).where(eq(automationRules.key, "bill_reminders"));
    const { getCashForecast } = await import("@/server/planner/forecast");
    vi.mocked(getCashForecast).mockRejectedValueOnce(new Error("boom"));
    const res = await runAutomations({ now: NOW, trigger: "test" });
    expect(res.disabled).toContain("bill_reminders");
    expect(res.rules.find((r) => r.key === "cash_warning")).toMatchObject({ ok: false, error: "boom" });
    expect(res.rules.find((r) => r.key === "invoice_overdue")?.notifications).toBe(1);
    expect(res.ok).toBe(false);
    const [rule] = await db.select().from(automationRules).where(eq(automationRules.key, "cash_warning"));
    expect(rule.lastResult).toBe("Error: boom");
  });

  it("waits for the digest time", async () => {
    const res = await runAutomations({ now: istToInstant("2026-10-14", "07:30"), trigger: "test", only: ["daily_digest"] });
    expect(res.rules[0].notifications).toBe(0);
    expect(res.rules[0].skipped).toContain("08:00");
  });

  it("sends the weekly review on the review day after 6 pm, once", async () => {
    await seedScenario();
    const [acct] = await db.execute<{ id: string }>(sql`select id from accounts limit 1`);
    await db.execute(sql`insert into transactions (workspace, type, date, account_id, amount_paise) values ('mahisys', 'income', '2026-10-15', ${acct.id}, 500000)`);
    const sunday = istToInstant("2026-10-18", "18:30");
    const res = await runAutomations({ now: sunday, trigger: "test", only: ["weekly_review"] });
    expect(res.rules[0]).toMatchObject({ ok: true, notifications: 1 });
    const [n] = await db.select().from(notifications).where(eq(notifications.kind, "weekly_review"));
    expect(n.title).toContain("Your week in review");
    expect(n.body).toContain("1/1 planned tasks done"); // the maid task due 13 Oct is done
    const again = await runAutomations({ now: new Date(sunday.getTime() + 15 * 60_000), trigger: "test", only: ["weekly_review"] });
    expect(again.rules[0].notifications).toBe(0);
  });
});
