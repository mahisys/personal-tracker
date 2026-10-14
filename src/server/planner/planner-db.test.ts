import { beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bills, categories, invoices, renewals, transactions } from "@/db/schema";
import { resetDb } from "@/test/db";
import { getAccountBalances } from "@/server/ledger";
import { applySuggestions, markRenewed, moveBillAction, payBill, saveBill, skipBillAction } from "./actions";
import { getCashForecast } from "./forecast";
import { getSeries } from "./queries";

function form(obj: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) for (const x of v) f.append(k, x);
    else f.set(k, v);
  }
  return f;
}

async function bank(opening = 100_000_00) {
  const [a] = await db.insert(accounts).values({ name: "HDFC", type: "bank", openingBalancePaise: opening, openingDate: "2026-01-01" }).returning();
  return a;
}

describe("bills", () => {
  beforeEach(resetDb);

  it("mark paid records the expense, links it, and schedules the next monthly instance", async () => {
    const acct = await bank();
    const [emiCat] = await db.select().from(categories).where(eq(categories.name, "EMI & loan repayment"));
    const res = await saveBill(
      undefined,
      form({
        title: "Car EMI",
        payee: "HDFC Bank",
        kind: "emi",
        amount: "15,000",
        dueDate: "2026-01-31",
        priority: "must",
        workspace: "personal",
        categoryId: emiCat.id,
        accountId: acct.id,
        canMove: "on",
        latestDate: "2026-02-03",
        repeat: "monthly",
        repeatEvery: "1",
        remindDaysBefore: "3, 1, 7",
      }),
    );
    expect(res).toMatchObject({ ok: true });
    const [bill] = await db.select().from(bills);
    expect(bill.remindDaysBefore).toEqual([7, 3, 1]);

    const paid = await payBill(undefined, form({ id: bill.id, date: "2026-01-30", accountId: acct.id, amount: "15000" }));
    expect(paid).toMatchObject({ ok: true, celebrate: true });
    expect(paid && "message" in paid ? paid.message : "").toMatch(/early/);

    const rows = await db.select().from(bills).orderBy(asc(bills.dueDate));
    expect(rows).toHaveLength(2);
    const [first, next] = rows;
    const [txn] = await db.select().from(transactions);
    expect(first).toMatchObject({ status: "paid", paidDate: "2026-01-30", paidTransactionId: txn.id, seriesId: bill.id });
    expect(txn).toMatchObject({ type: "expense", billId: bill.id, categoryId: emiCat.id, amountPaise: 15_000_00, party: "HDFC Bank", workspace: "personal" });
    // Jan 31 → Feb 28, keeping 3 days of slack.
    expect(next).toMatchObject({ status: "upcoming", dueDate: "2026-02-28", latestDate: "2026-03-03", seriesId: bill.id, amountPaise: 15_000_00, kind: "emi" });

    // Paying the next one keeps the original 31st anchor.
    await payBill(undefined, form({ id: next.id, date: "2026-02-28", accountId: acct.id, amount: "15000" }));
    const third = (await db.select().from(bills).where(eq(bills.status, "upcoming")))[0];
    expect(third.dueDate).toBe("2026-03-31");

    const series = await getSeries(third);
    expect(series.map((s) => s.status)).toEqual(["upcoming", "paid", "paid"]);
    expect(series[1].payment?.amountPaise).toBe(15_000_00);

    const bal = (await getAccountBalances()).find((b) => b.id === acct.id)!;
    expect(bal.balancePaise).toBe(70_000_00);

    // Paying twice is refused.
    expect(await payBill(undefined, form({ id: bill.id, date: "2026-01-30", accountId: acct.id, amount: "15000" }))).toMatchObject({ ok: false });
  });

  it("skip moves a recurring bill on; a one-off is just skipped", async () => {
    await saveBill(undefined, form({ title: "Netflix", amount: "649", dueDate: "2026-10-20", workspace: "personal", repeat: "monthly" }));
    await saveBill(undefined, form({ title: "Gift", amount: "2000", dueDate: "2026-10-22", workspace: "personal" }));
    const all = await db.select().from(bills);
    const netflix = all.find((b) => b.title === "Netflix")!;
    const gift = all.find((b) => b.title === "Gift")!;
    expect(await skipBillAction(undefined, form({ id: netflix.id }))).toMatchObject({ ok: true });
    expect(await skipBillAction(undefined, form({ id: gift.id }))).toMatchObject({ ok: true });
    const after = await db.select().from(bills).orderBy(asc(bills.dueDate));
    expect(after.map((b) => [b.title, b.dueDate, b.status])).toEqual([
      ["Netflix", "2026-10-20", "skipped"],
      ["Gift", "2026-10-22", "skipped"],
      ["Netflix", "2026-11-20", "upcoming"],
    ]);
    expect(await db.select().from(transactions)).toHaveLength(0);
  });

  it("move respects the latest date and fixed bills", async () => {
    await saveBill(undefined, form({ title: "Vendor", amount: "5000", dueDate: "2026-10-20", workspace: "mahisys", canMove: "on", latestDate: "2026-10-30", priority: "can_wait" }));
    await saveBill(undefined, form({ title: "GST", amount: "9000", dueDate: "2026-10-20", workspace: "mahisys", priority: "must" }));
    const [vendor] = await db.select().from(bills).where(eq(bills.title, "Vendor"));
    const [gst] = await db.select().from(bills).where(eq(bills.title, "GST"));
    expect(await moveBillAction(undefined, form({ id: vendor.id, toDate: "2026-11-02" }))).toMatchObject({ ok: false });
    expect(await moveBillAction(undefined, form({ id: gst.id, toDate: "2026-10-25" }))).toMatchObject({ ok: false });
    expect(await moveBillAction(undefined, form({ id: vendor.id, toDate: "2026-10-28" }))).toMatchObject({ ok: true });
    expect((await db.select().from(bills).where(eq(bills.id, vendor.id)))[0].dueDate).toBe("2026-10-28");
    expect(await saveBill(undefined, form({ title: "Bad", amount: "1", dueDate: "2026-10-20", workspace: "personal", canMove: "on", latestDate: "2026-10-10" }))).toMatchObject({ ok: false });
  });
});

describe("getCashForecast", () => {
  beforeEach(resetDb);

  it("loads balances, bills and invoices, and suggestions can be applied", async () => {
    await bank(30_000_00);
    await saveBill(undefined, form({ title: "Rent", amount: "20000", dueDate: "2026-10-16", workspace: "personal", priority: "must" }));
    await saveBill(undefined, form({ title: "New laptop", amount: "15000", dueDate: "2026-10-18", workspace: "mahisys", priority: "can_wait", canMove: "on", latestDate: "2026-11-10" }));
    await db.insert(invoices).values({
      workspace: "mahisys",
      number: "MS-001",
      billTo: { name: "Acme" },
      issueDate: "2026-10-01",
      dueDate: "2026-10-25",
      status: "part_paid",
      totalPaise: 50_000_00,
      paidPaise: 10_000_00,
    });

    const f = await getCashForecast({ today: "2026-10-14", days: 60 });
    expect(f.startBalancePaise).toBe(30_000_00);
    expect(f.minBalancePaise).toBe(25_000_00);
    expect(f.days).toHaveLength(60);
    expect(f.days.find((d) => d.date === "2026-10-25")!.inPaise).toBe(40_000_00);
    expect(f.shortfall).toEqual({ firstDate: "2026-10-16", amountPaise: 25_000_00 - (30_000_00 - 35_000_00) });
    expect(f.suggestions.map((s) => s.title)).toEqual(["New laptop"]);

    // Workspace filter: only MahiSys bills and invoices.
    const m = await getCashForecast({ today: "2026-10-14", days: 60, workspace: "mahisys" });
    expect(m.days.flatMap((d) => d.items).map((i) => i.label).sort()).toEqual(["Invoice MS-001 · Acme", "New laptop"]);

    const s = f.suggestions[0];
    expect(await applySuggestions(undefined, form({ billId: [s.billId], toDate: [s.toDate] }))).toMatchObject({ ok: true });
    const [moved] = await db.select().from(bills).where(eq(bills.id, s.billId));
    expect(moved.dueDate).toBe("2026-11-10");
  });
});

describe("renewals", () => {
  beforeEach(resetDb);
  it("mark renewed sets the new expiry and renewedAt", async () => {
    const [r] = await db.insert(renewals).values({ workspace: "personal", name: "Car insurance", expiresOn: "2026-10-20" }).returning();
    expect(await markRenewed(undefined, form({ id: r.id, expiresOn: "2026-10-01" }))).toMatchObject({ ok: false });
    expect(await markRenewed(undefined, form({ id: r.id, expiresOn: "2027-10-20" }))).toMatchObject({ ok: true, celebrate: true });
    const [after] = await db.select().from(renewals);
    expect(after.expiresOn).toBe("2027-10-20");
    expect(after.renewedAt).toBeInstanceOf(Date);
  });
});
