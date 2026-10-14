import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/server/settings";
import { pdfMoney, renderInvoicePdf } from "./pdf";

describe("invoice PDF", () => {
  it("formats money with Indian grouping and Rs.", () => {
    expect(pdfMoney(125000050)).toBe("Rs. 12,50,000.50");
    expect(pdfMoney(99900)).toBe("Rs. 999.00");
    expect(pdfMoney(0)).toBe("Rs. 0.00");
  });

  it("renders a PDF document", async () => {
    const now = new Date();
    const inv = {
      id: "00000000-0000-0000-0000-000000000001", workspace: "mahisys" as const, number: "MS/2026-27/001", companyId: null, contactId: null, projectId: null, quoteId: null, leadId: null,
      billTo: { name: "Sharma Traders", gstin: "27ABCDE1234F1Z5", address: "MG Road, Pune", stateCode: "27", email: "a@b.in" },
      issueDate: "2026-10-14", dueDate: "2026-10-29", status: "sent" as const, placeOfSupply: "27", interstate: false,
      subtotalPaise: 5_500_000, cgstPaise: 495_000, sgstPaise: 495_000, igstPaise: 0, totalPaise: 6_490_000, paidPaise: 0,
      notes: "Thank you for your business", terms: "Payment due in 15 days", sentAt: now, createdAt: now, updatedAt: now,
    };
    const items = [
      { id: "1", docType: "invoice" as const, docId: inv.id, description: "Website design", hsnSac: "998314", quantity: 1, unitPricePaise: 5_000_000, gstRateBps: 1800, sort: 0 },
      { id: "2", docType: "invoice" as const, docId: inv.id, description: "Logo", hsnSac: "998391", quantity: 2, unitPricePaise: 250_000, gstRateBps: 1800, sort: 1 },
    ];
    const settings = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings.business, { gstin: "27AAAAA0000A1Z5", stateCode: "27", bankName: "HDFC", bankAccountNo: "123", bankIfsc: "HDFC0001", upiId: "mahisys@hdfc" });
    const buf = await renderInvoicePdf(inv, items, settings);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  });
});
