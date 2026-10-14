import { applyBps } from "./money";

export type LineInput = { quantity: number; unitPricePaise: number; gstRateBps: number };

export type GstTotals = {
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalPaise: number;
  /** Taxable value and tax per GST rate, for the invoice tax summary */
  byRate: { gstRateBps: number; taxablePaise: number; taxPaise: number }[];
};

export function lineTaxable(l: LineInput): number {
  return Math.round(l.quantity * l.unitPricePaise);
}

/**
 * GST totals for a document. Intra-state supply splits tax equally into CGST + SGST;
 * inter-state supply is charged as IGST. Tax is computed per rate on the summed taxable value.
 */
export function computeGst(lines: LineInput[], interstate: boolean): GstTotals {
  const rates = new Map<number, number>();
  for (const l of lines) rates.set(l.gstRateBps, (rates.get(l.gstRateBps) ?? 0) + lineTaxable(l));
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const byRate: GstTotals["byRate"] = [];
  for (const [rate, taxable] of [...rates.entries()].sort((a, b) => a[0] - b[0])) {
    subtotal += taxable;
    if (interstate) {
      const t = applyBps(taxable, rate);
      igst += t;
      byRate.push({ gstRateBps: rate, taxablePaise: taxable, taxPaise: t });
    } else {
      const half = applyBps(taxable, rate / 2);
      cgst += half;
      sgst += half;
      byRate.push({ gstRateBps: rate, taxablePaise: taxable, taxPaise: half * 2 });
    }
  }
  const tax = cgst + sgst + igst;
  return { subtotalPaise: subtotal, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst, taxPaise: tax, totalPaise: subtotal + tax, byRate };
}

/** Supply is inter-state when the supplier's and the place-of-supply state codes differ. */
export function isInterstate(supplierStateCode: string | null | undefined, placeOfSupply: string | null | undefined): boolean {
  if (!supplierStateCode || !placeOfSupply) return false;
  return supplierStateCode.trim() !== placeOfSupply.trim();
}

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidGstin(gstin: string): boolean {
  return GSTIN_RE.test(gstin.trim().toUpperCase());
}

export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.length < 2) return null;
  return /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : null;
}

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" }, { code: "02", name: "Himachal Pradesh" }, { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" }, { code: "05", name: "Uttarakhand" }, { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" }, { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" }, { code: "11", name: "Sikkim" }, { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" }, { code: "14", name: "Manipur" }, { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" }, { code: "17", name: "Meghalaya" }, { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" }, { code: "20", name: "Jharkhand" }, { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" }, { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" }, { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" }, { code: "30", name: "Goa" }, { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" }, { code: "33", name: "Tamil Nadu" }, { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" }, { code: "36", name: "Telangana" }, { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];
