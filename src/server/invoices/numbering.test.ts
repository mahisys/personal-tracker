import { beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, lineItems, quotes, settings } from "@/db/schema";
import { resetDb } from "@/test/db";
import { saveInvoice } from "./actions";
import { saveQuote } from "@/server/sales/actions";
import { fyCode, formatDocNumber, maxSeq } from "./numbering";
import { fd, sampleItems } from "./test-helpers";

const create = (issueDate: string) =>
  saveInvoice(undefined, fd({ billToName: "Sharma Traders", issueDate, items: sampleItems, workspace: "mahisys" }));

describe("document numbering per financial year", () => {
  beforeEach(async () => {
    await resetDb();
    await db.insert(settings).values({ key: "business", value: { invoicePrefix: "MS", quotePrefix: "QT", stateCode: "27" } });
  });

  it("pure helpers", () => {
    expect(fyCode("2026-04-01")).toBe("2026-27");
    expect(fyCode("2027-03-31")).toBe("2026-27");
    expect(fyCode("2026-03-31")).toBe("2025-26");
    expect(formatDocNumber("MS", "2026-27", 7)).toBe("MS/2026-27/007");
    expect(maxSeq(["MS/2026-27/009", "MS/2026-27/010", "MS/2025-26/044", "XX/2026-27/099"], "MS", "2026-27")).toBe(10);
  });

  it("numbers invoices sequentially and restarts each April", async () => {
    const r1 = await create("2026-10-14");
    const r2 = await create("2026-11-02");
    const r3 = await create("2026-03-31"); // previous FY
    const r4 = await create("2027-04-01"); // next FY
    for (const r of [r1, r2, r3, r4]) expect(r?.ok).toBe(true);
    const rows = await db.select({ number: invoices.number, total: invoices.totalPaise }).from(invoices).orderBy(asc(invoices.createdAt));
    expect(rows.map((r) => r.number)).toEqual(["MS/2026-27/001", "MS/2026-27/002", "MS/2025-26/001", "MS/2027-28/001"]);
    // 50000 + 5000 = 55000 taxable + 18% = 64900
    expect(rows[0].total).toBe(6_490_000);
    const items = await db.select().from(lineItems).where(eq(lineItems.docType, "invoice"));
    expect(items).toHaveLength(8);
  });

  it("never hands out the same number to concurrent creations", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => create("2026-10-14")));
    expect(results.every((r) => r?.ok)).toBe(true);
    const rows = await db.select({ number: invoices.number }).from(invoices);
    expect(new Set(rows.map((r) => r.number)).size).toBe(5);
    expect(rows.map((r) => r.number).sort()).toEqual(["001", "002", "003", "004", "005"].map((s) => `MS/2026-27/${s}`));
  });

  it("numbers quotes with the quote prefix", async () => {
    const r = await saveQuote(undefined, fd({ contactId: null, companyId: null, leadId: null, issueDate: "2026-10-14", items: sampleItems }));
    expect(r?.ok).toBe(false); // needs a recipient
    const { companies } = await import("@/db/schema");
    const [c] = await db.insert(companies).values({ workspace: "mahisys", name: "Acme" }).returning();
    await saveQuote(undefined, fd({ companyId: c.id, issueDate: "2026-10-14", items: sampleItems }));
    await saveQuote(undefined, fd({ companyId: c.id, issueDate: "2026-10-15", items: sampleItems }));
    const qs = await db.select({ number: quotes.number }).from(quotes).orderBy(asc(quotes.createdAt));
    expect(qs.map((q) => q.number)).toEqual(["QT/2026-27/001", "QT/2026-27/002"]);
  });
});
