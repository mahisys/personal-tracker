/**
 * Line-item maths shared by the quote/invoice editor (client) and the server actions.
 * Pure and safe on both sides: the editor shows exactly what the server will store.
 */
import { computeGst, isInterstate, type GstTotals, type LineInput } from "@/lib/gst";
import { paiseToInput, parseRupeesToPaise, percentToBps } from "@/lib/money";

/** What the editor holds per row (strings, as typed). */
export type EditorRow = { description: string; hsnSac: string; quantity: string; unitPrice: string; gstRate: string };

/** A validated item ready for the line_items table. */
export type ParsedItem = LineInput & { description: string; hsnSac: string | null; sort: number };

export const GST_RATE_OPTIONS = ["0", "5", "12", "18", "28", "40"];

export function emptyRow(gstRate = "18"): EditorRow {
  return { description: "", hsnSac: "", quantity: "1", unitPrice: "", gstRate };
}

/** Converts one editor row to numbers. Returns null when it cannot be priced yet. */
export function rowToLine(r: EditorRow): LineInput | null {
  const quantity = Number(String(r.quantity).replace(/,/g, "").trim());
  const unitPricePaise = parseRupeesToPaise(r.unitPrice);
  const gstRateBps = percentToBps(r.gstRate) ?? 0;
  if (!Number.isFinite(quantity) || quantity <= 0 || unitPricePaise == null) return null;
  return { quantity: Math.round(quantity * 1000) / 1000, unitPricePaise, gstRateBps };
}

/** Totals exactly as the editor shows them. */
export function editorTotals(rows: EditorRow[], interstate: boolean): GstTotals {
  return computeGst(rows.map(rowToLine).filter((l): l is LineInput => l != null), interstate);
}

/** Convenience for the editor: totals for a seller state and place of supply. */
export function editorTotalsFor(rows: EditorRow[], sellerStateCode: string | null | undefined, placeOfSupply: string | null | undefined) {
  const interstate = isInterstate(sellerStateCode, placeOfSupply);
  return { interstate, ...editorTotals(rows, interstate) };
}

/** Parses the hidden `items` JSON field posted by the editor. */
export function parseItemsJson(json: string | null | undefined): { ok: true; items: ParsedItem[] } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json || "[]");
  } catch {
    return { ok: false, error: "Line items could not be read — please try again" };
  }
  if (!Array.isArray(raw)) return { ok: false, error: "Line items could not be read" };
  const items: ParsedItem[] = [];
  for (const [i, r] of (raw as Partial<EditorRow>[]).entries()) {
    const row: EditorRow = {
      description: String(r?.description ?? "").trim(),
      hsnSac: String(r?.hsnSac ?? "").trim(),
      quantity: String(r?.quantity ?? ""),
      unitPrice: String(r?.unitPrice ?? ""),
      gstRate: String(r?.gstRate ?? "0"),
    };
    const blank = !row.description && !row.unitPrice.trim();
    if (blank) continue;
    if (!row.description) return { ok: false, error: `Line ${i + 1} needs a description` };
    const line = rowToLine(row);
    if (!line) return { ok: false, error: `Check the quantity and price on line ${i + 1}` };
    if (line.unitPricePaise < 0) return { ok: false, error: `Line ${i + 1} has a negative price` };
    if (line.gstRateBps < 0 || line.gstRateBps > 10000) return { ok: false, error: `Line ${i + 1} has an invalid GST rate` };
    items.push({ ...line, description: row.description, hsnSac: row.hsnSac || null, sort: items.length });
  }
  if (items.length === 0) return { ok: false, error: "Add at least one line item" };
  return { ok: true, items };
}

/** Database rows → editor rows. */
export function itemsToRows(items: { description: string; hsnSac: string | null; quantity: number; unitPricePaise: number; gstRateBps: number }[]): EditorRow[] {
  return items.map((i) => ({
    description: i.description,
    hsnSac: i.hsnSac ?? "",
    quantity: String(Number(i.quantity)),
    unitPrice: paiseToInput(i.unitPricePaise),
    gstRate: String(i.gstRateBps / 100),
  }));
}
