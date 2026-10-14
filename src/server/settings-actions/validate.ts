/**
 * Pure validation for the settings forms. Each returns either { value } (ready to save) or { error }.
 */
import type { AppSettings } from "@/server/settings";
import { INDIAN_STATES, isValidGstin, stateCodeFromGstin } from "@/lib/gst";
import { parseRupeesToPaise, percentToBps } from "@/lib/money";

type Result<T> = { value: T; error?: undefined } | { error: string; value?: undefined };

type Raw = Record<string, string | null | undefined>;

const s = (v: string | null | undefined) => (v ?? "").trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;
const PREFIX_RE = /^[A-Za-z0-9/-]{1,10}$/;

export function validateBusiness(raw: Raw): Result<AppSettings["business"]> {
  const gstin = s(raw.gstin).toUpperCase().replace(/\s+/g, "");
  const pan = s(raw.pan).toUpperCase();
  const ifsc = s(raw.bankIfsc).toUpperCase();
  const upiId = s(raw.upiId);
  const email = s(raw.email);
  let stateCode = s(raw.stateCode);
  const name = s(raw.name);
  if (!name) return { error: "Add your business name" };
  if (gstin) {
    if (!isValidGstin(gstin)) return { error: "That GSTIN doesn't look right — it should be 15 characters like 27ABCDE1234F1Z5" };
    const fromGstin = stateCodeFromGstin(gstin)!;
    if (stateCode && stateCode !== fromGstin) {
      const st = INDIAN_STATES.find((x) => x.code === fromGstin);
      return { error: `Your GSTIN is registered in ${st?.name ?? `state ${fromGstin}`} — pick that state` };
    }
    stateCode = fromGstin;
    if (pan && gstin.slice(2, 12) !== pan) return { error: "The PAN doesn't match the one inside your GSTIN" };
  }
  if (stateCode && !INDIAN_STATES.some((x) => x.code === stateCode)) return { error: "Pick your state from the list" };
  if (pan && !PAN_RE.test(pan)) return { error: "PAN should look like ABCDE1234F" };
  if (ifsc && !IFSC_RE.test(ifsc)) return { error: "IFSC should look like HDFC0001234" };
  if (upiId && !UPI_RE.test(upiId)) return { error: "UPI ID should look like name@bank" };
  if (email && !EMAIL_RE.test(email)) return { error: "That email doesn't look right" };
  const invoicePrefix = s(raw.invoicePrefix) || "MS";
  const quotePrefix = s(raw.quotePrefix) || "QT";
  if (!PREFIX_RE.test(invoicePrefix) || !PREFIX_RE.test(quotePrefix)) return { error: "Prefixes can use letters, numbers, - and / (up to 10)" };
  const terms = Number(s(raw.defaultPaymentTermsDays) || "15");
  if (!Number.isInteger(terms) || terms < 0 || terms > 365) return { error: "Payment terms should be 0–365 days" };
  const accountNo = s(raw.bankAccountNo).replace(/\s+/g, "");
  if (accountNo && !/^\d{6,20}$/.test(accountNo)) return { error: "Account number should be 6–20 digits" };
  return {
    value: {
      name,
      legalName: s(raw.legalName),
      gstin,
      pan: pan || (gstin ? gstin.slice(2, 12) : ""),
      stateCode,
      address: s(raw.address),
      email,
      phone: s(raw.phone),
      bankName: s(raw.bankName),
      bankAccountNo: accountNo,
      bankIfsc: ifsc,
      upiId,
      invoicePrefix,
      quotePrefix,
      defaultPaymentTermsDays: terms,
      defaultInvoiceTerms: s(raw.defaultInvoiceTerms),
    },
  };
}

export function validatePlanning(raw: Raw, workdays: string[]): Result<AppSettings["planning"]> {
  const hours = Number(s(raw.dailyHours));
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 16) return { error: "Daily hours should be between 0.5 and 16" };
  const days = [...new Set(workdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (!days.length) return { error: "Pick at least one working day" };
  return { value: { dailyHours: Math.round(hours * 2) / 2, workdays: days } };
}

export function validateFinance(raw: Raw): Result<AppSettings["finance"]> {
  const min = parseRupeesToPaise(s(raw.minBalance) || "0");
  if (min == null || min < 0) return { error: "Minimum balance should be an amount like 25000" };
  const tds = percentToBps(s(raw.commissionTds) || "0");
  const gst = percentToBps(s(raw.commissionGst) || "0");
  if (tds == null || tds < 0 || tds > 3000) return { error: "TDS should be between 0% and 30%" };
  if (gst == null || gst < 0 || gst > 2800) return { error: "GST should be between 0% and 28%" };
  return { value: { minBalancePaise: min, commissionTdsBps: tds, commissionGstBps: gst } };
}

export function validateNotifications(raw: Raw, checks: { emailEnabled: boolean; pushEnabled: boolean }): Result<AppSettings["notifications"]> {
  const t = s(raw.digestTime);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return { error: "Pick a digest time" };
  const email = s(raw.digestEmail);
  if (email && !EMAIL_RE.test(email)) return { error: "That digest email doesn't look right" };
  const day = Number(s(raw.weeklyReviewDay) || "0");
  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "Pick a weekly review day" };
  return { value: { timezone: "Asia/Kolkata", digestTime: t, digestEmail: email, emailEnabled: checks.emailEnabled, pushEnabled: checks.pushEnabled, weeklyReviewDay: day } };
}
