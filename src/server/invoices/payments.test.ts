import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, invoicePayments, invoices, settings, transactions } from "@/db/schema";
import { resetDb } from "@/test/db";
import { markInvoiceSent, recordInvoicePayment, saveInvoice } from "./actions";
import { fd, sampleItems } from "./test-helpers";

async function setup(placeOfSupply: string) {
  await db.insert(settings).values({ key: "business", value: { invoicePrefix: "MS", stateCode: "27" } });
  const [acct] = await db.insert(accounts).values({ name: "HDFC Current", type: "bank", workspace: "mahisys", openingDate: "2026-04-01" }).returning();
  await saveInvoice(undefined, fd({ billToName: "Sharma Traders", issueDate: "2026-10-01", placeOfSupply, items: sampleItems, workspace: "mahisys" }));
  const [inv] = await db.select().from(invoices);
  await markInvoiceSent(undefined, fd({ id: inv.id }));
  return { acct, inv };
}

describe("record invoice payment", () => {
  beforeEach(resetDb);

  it("books income with TDS and proportional GST, then settles the invoice", async () => {
    const { acct, inv } = await setup("27");
    expect(inv.totalPaise).toBe(6_490_000);
    expect(inv.cgstPaise).toBe(495_000);
    expect(inv.sgstPaise).toBe(495_000);
    expect(inv.interstate).toBe(false);

    // Part payment: ₹30,000 received + ₹500 TDS = ₹30,500 credited
    const r1 = await recordInvoicePayment(
      undefined,
      fd({ invoiceId: inv.id, accountId: acct.id, amount: "30000", tds: "500", date: "2026-10-10", mode: "NEFT", reference: "UTR123" }),
    );
    expect(r1).toMatchObject({ ok: true });
    expect(r1 && "celebrate" in r1 ? r1.celebrate : undefined).toBeFalsy();
    let [after] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(after.paidPaise).toBe(3_050_000);
    expect(after.status).toBe("part_paid");

    const txns = await db.select().from(transactions).where(eq(transactions.invoiceId, inv.id));
    expect(txns).toHaveLength(1);
    const [salesCat] = await db.select().from(categories).where(eq(categories.name, "Sales / services"));
    expect(txns[0]).toMatchObject({
      type: "income",
      workspace: "mahisys",
      accountId: acct.id,
      amountPaise: 3_000_000,
      tdsPaise: 50_000,
      gstPaise: Math.round((990_000 * 3_050_000) / 6_490_000),
      party: "Sharma Traders",
      categoryId: salesCat.id,
      reference: "UTR123",
    });
    const [pay] = await db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, inv.id));
    expect(pay.transactionId).toBe(txns[0].id);

    // Overpayment is refused
    const over = await recordInvoicePayment(undefined, fd({ invoiceId: inv.id, accountId: acct.id, amount: "40000", date: "2026-10-12" }));
    expect(over).toMatchObject({ ok: false });

    // Final payment settles it and celebrates
    const r2 = await recordInvoicePayment(undefined, fd({ invoiceId: inv.id, accountId: acct.id, amount: "34400", date: "2026-10-12" }));
    expect(r2).toMatchObject({ ok: true, celebrate: true });
    [after] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(after.paidPaise).toBe(6_490_000);
    expect(after.status).toBe("paid");
    const all = await db.select().from(transactions).where(eq(transactions.invoiceId, inv.id));
    expect(all).toHaveLength(2);
    expect(all.reduce((s, t) => s + t.gstPaise, 0)).toBe(990_000);

    const again = await recordInvoicePayment(undefined, fd({ invoiceId: inv.id, accountId: acct.id, amount: "1", date: "2026-10-12" }));
    expect(again).toMatchObject({ ok: false });
  });

  it("uses IGST for an inter-state client", async () => {
    const { inv } = await setup("29");
    expect(inv.interstate).toBe(true);
    expect(inv.igstPaise).toBe(990_000);
    expect(inv.cgstPaise + inv.sgstPaise).toBe(0);
  });
});
