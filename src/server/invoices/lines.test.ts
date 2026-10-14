import { describe, expect, it } from "vitest";
import { editorTotals, editorTotalsFor, parseItemsJson, type EditorRow } from "./lines";

const rows: EditorRow[] = [
  { description: "Website design", hsnSac: "998314", quantity: "1", unitPrice: "50,000", gstRate: "18" },
  { description: "Hosting (12 months)", hsnSac: "998315", quantity: "12", unitPrice: "499.50", gstRate: "18" },
  { description: "Printed brochures", hsnSac: "4911", quantity: "2.5", unitPrice: "1000", gstRate: "12" },
  { description: "", hsnSac: "", quantity: "1", unitPrice: "", gstRate: "18" }, // blank row is ignored
];

describe("editor GST totals", () => {
  it("splits CGST + SGST for intra-state supply", () => {
    const t = editorTotalsFor(rows, "27", "27");
    expect(t.interstate).toBe(false);
    // taxable: 50000 + 5994 + 2500 = 58494 rupees
    expect(t.subtotalPaise).toBe(5_849_400);
    // 18% on 55994 = 10078.92 → 9% halves 5039.46 each; 12% on 2500 = 300 → 150 each
    expect(t.cgstPaise).toBe(503_946 + 15_000);
    expect(t.sgstPaise).toBe(503_946 + 15_000);
    expect(t.igstPaise).toBe(0);
    expect(t.totalPaise).toBe(5_849_400 + 2 * 518_946);
  });
  it("charges IGST for inter-state supply", () => {
    const t = editorTotalsFor(rows, "27", "29");
    expect(t.interstate).toBe(true);
    expect(t.cgstPaise + t.sgstPaise).toBe(0);
    expect(t.igstPaise).toBe(1_007_892 + 30_000);
    expect(t.totalPaise).toBe(5_849_400 + 1_037_892);
  });
  it("treats a missing place of supply as intra-state", () => {
    expect(editorTotalsFor(rows, "27", null).interstate).toBe(false);
  });
  it("the server parses the same rows to the same totals", () => {
    const parsed = parseItemsJson(JSON.stringify(rows));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[1]).toMatchObject({ quantity: 12, unitPricePaise: 49_950, gstRateBps: 1800, hsnSac: "998315" });
    expect(editorTotals(rows, false).totalPaise).toBe(editorTotalsFor(rows, "27", "27").totalPaise);
  });
  it("rejects bad rows with a friendly message", () => {
    expect(parseItemsJson(JSON.stringify([{ description: "", unitPrice: "100", quantity: "1", gstRate: "18" }]))).toEqual({ ok: false, error: "Line 1 needs a description" });
    expect(parseItemsJson("[]")).toEqual({ ok: false, error: "Add at least one line item" });
    expect(parseItemsJson(JSON.stringify([{ description: "X", unitPrice: "abc", quantity: "1", gstRate: "18" }])).ok).toBe(false);
  });
});
