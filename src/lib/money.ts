/** Money helpers. All amounts in the database are integer paise. */

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function toRupees(paise: number): number {
  return paise / 100;
}

/** Parses user input like "1,25,000.50", "₹ 500", "-20" into paise. Returns null when empty or invalid. */
export function parseRupeesToPaise(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[₹,\s]/g, "").trim();
  if (cleaned === "") return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return toPaise(Number(cleaned));
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** "₹1,25,000.5" style (Indian grouping). */
export function formatINR(paise: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (paise == null) return "—";
  return (opts.whole ? inrWhole : inr).format(paise / 100);
}

/** Short form for dashboards: ₹4.2L, ₹1.3Cr, ₹85K. */
export function formatINRShort(paise: number | null | undefined): string {
  if (paise == null) return "—";
  const r = paise / 100;
  const sign = r < 0 ? "-" : "";
  const a = Math.abs(r);
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}

function trim(n: number): string {
  return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}

/** Value for an <input> showing rupees, e.g. 12500050 → "125000.5". */
export function paiseToInput(paise: number | null | undefined): string {
  if (paise == null) return "";
  return String(paise / 100);
}

/** Applies a basis-point rate to an amount, rounding half up to the nearest paisa. 1800 bps = 18%. */
export function applyBps(amountPaise: number, bps: number): number {
  return Math.round((amountPaise * bps) / 10000);
}

export function bpsToPercent(bps: number | null | undefined): string {
  if (bps == null) return "";
  return String(bps / 100);
}

export function percentToBps(input: string | number | null | undefined): number | null {
  if (input == null || input === "") return null;
  const n = Number(String(input).replace("%", "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
