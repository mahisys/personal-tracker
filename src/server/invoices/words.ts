/**
 * Amount in words using the Indian numbering system (thousand, lakh, crore).
 * Pure; used on the invoice PDF and preview.
 *
 *   amountInWords(125000050) → "Rupees Twelve Lakh Fifty Thousand and Fifty Paise Only"
 */
const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t} ${ONES[n % 10]}` : t;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(" ");
}

/** Whole number in Indian-system words. 0 → "Zero". */
export function numberToIndianWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}

export function amountInWords(paise: number): string {
  const total = Math.round(Math.abs(paise));
  const rupees = Math.floor(total / 100);
  const p = total % 100;
  if (rupees === 0 && p === 0) return "Rupees Zero Only";
  if (rupees === 0) return `${belowHundred(p)} Paise Only`;
  const r = `Rupees ${numberToIndianWords(rupees)}`;
  return p ? `${r} and ${belowHundred(p)} Paise Only` : `${r} Only`;
}
