import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { db } from "@/db";
import { accounts, borrowers, categories, contacts, invoices, loanFiles, tasks, timeEntries, transactions } from "@/db/schema";
import { resetDb } from "@/test/db";
import { getBudget, getEstimateAccuracy, getExpensesByCategory, getGstSummary, getPnl, getReceivables, getTimeReport } from "./queries";
import { buildWorkbook, cellValue, describeColumn } from "./export";
import { escapeLike, normaliseQuery, searchAll } from "@/server/search/search";
import { eq } from "drizzle-orm";

async function seed() {
  const [acct] = await db.select().from(accounts).limit(1);
  const [food] = await db.select().from(categories).where(eq(categories.name, "Food & dining"));
  await db.update(categories).set({ monthlyBudgetPaise: 500_000 }).where(eq(categories.id, food.id));
  await db.insert(transactions).values([
    { workspace: "mahisys", type: "income", date: "2026-05-10", accountId: acct.id, amountPaise: 10_000_000, party: "Acme Corp" },
    { workspace: "personal", type: "expense", date: "2026-05-12", accountId: acct.id, amountPaise: 600_000, categoryId: food.id, description: "Swiggy dinner", gstPaise: 30_000 },
  ]);
  await db.insert(invoices).values({
    workspace: "mahisys",
    number: "MS/26-27/001",
    billTo: { name: "Acme Corp" },
    issueDate: "2026-05-01",
    dueDate: "2026-05-16",
    status: "sent",
    subtotalPaise: 10_000_000,
    cgstPaise: 900_000,
    sgstPaise: 900_000,
    totalPaise: 11_800_000,
    paidPaise: 1_800_000,
  });
  await db.insert(contacts).values({ workspace: "mahisys", name: "Ravi Kumar", phone: "+91 98765 43210" });
  const [b] = await db.insert(borrowers).values({ name: "Asha Patil", phone: "9123456789" }).returning();
  await db.insert(loanFiles).values({ borrowerId: b.id, product: "home_loan", applicationNo: "HL-7781" });
  const [t] = await db
    .insert(tasks)
    .values({ workspace: "mahisys", title: "Build 50% of website", status: "done", estimateMinutes: 60, taskType: "development", completedAt: new Date() })
    .returning();
  await db.insert(timeEntries).values({ taskId: t.id, startedAt: new Date(), minutes: 90 });
}

describe("report queries (DB)", () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });

  it("aggregates P&L, expenses, receivables, GST, budget, time and estimates", async () => {
    const pnl = await getPnl(2026, null);
    expect(pnl.total).toEqual({ income: 10_000_000, expense: 600_000, net: 9_400_000 });
    expect((await getPnl(2026, "dsa")).total.income).toBe(0);

    const exp = await getExpensesByCategory({ from: "2026-05-01", to: "2026-05-31" }, null);
    expect(exp.slices[0]).toMatchObject({ name: "Food & dining", amountPaise: 600_000, share: 100 });

    const rec = await getReceivables("2026-10-14", null);
    expect(rec.totalPaise).toBe(10_000_000);
    expect(rec.totals["90_plus"]).toBe(10_000_000);

    const gst = await getGstSummary(2026, null);
    expect(gst.months[1]).toMatchObject({ outputPaise: 1_800_000, inputPaise: 30_000, netPaise: 1_770_000 });

    const budget = await getBudget("2026-05", null);
    expect(budget.lines[0]).toMatchObject({ name: "Food & dining", pct: 120, status: "over" });

    const time = await getTimeReport(4, new Date().toISOString().slice(0, 10), null);
    expect(time.total).toBe(90);

    const est = await getEstimateAccuracy(null);
    expect(est.overall).toMatchObject({ ratio: 1.5, verdict: "under" });
  });

  it("searches across modules with literal wildcards and phone digits", async () => {
    expect(normaliseQuery(" a ")).toBeNull();
    expect(escapeLike("50%_x")).toBe("50\\%\\_x");
    const r = await searchAll("acme");
    expect(r?.groups.map((g) => g.key).sort()).toEqual(["invoices", "transactions"]);
    expect((await searchAll("98765 43210"))?.groups[0].items[0].title).toBe("Ravi Kumar");
    expect((await searchAll("9876543210"))?.groups[0].key).toBe("contacts");
    expect((await searchAll("hl-77"))?.groups[0].items[0]).toMatchObject({ title: "HL-7781 · Asha Patil" });
    expect((await searchAll("50%"))?.groups[0].key).toBe("tasks");
    expect((await searchAll("5%"))?.total).toBe(0);
  });

  it("exports every business table with rupee columns", async () => {
    const spec = describeColumn("amountPaise", 1);
    expect(spec).toMatchObject({ header: "Amount (₹)", kind: "money" });
    expect(cellValue(spec, 12345)).toBe(123.45);
    expect(describeColumn("gstRateBps", 1800).header).toBe("Gst rate (%)");
    expect(cellValue(describeColumn("dueDate", "2026-10-14"), "2026-10-14")).toEqual(new Date("2026-10-14T00:00:00Z"));
    const wb = await buildWorkbook();
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    const sheet = back.getWorksheet("Transactions")!;
    const headers = (sheet.getRow(1).values as unknown[]).filter(Boolean);
    expect(headers).toContain("Amount (₹)");
    const col = headers.indexOf("Amount (₹)") + 1;
    const amounts = [2, 3].map((r) => sheet.getRow(r).getCell(col).value);
    expect(amounts.sort()).toEqual([100000, 6000]);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(back.worksheets.length).toBeGreaterThan(20);
  });
});
