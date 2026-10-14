/**
 * Bank-statement import: pure parsing, matching and hashing. No database access here, so it is
 * easy to test. The server actions in ./import-actions.ts wire it to the database.
 */
import Papa from "papaparse";
import { createHash } from "node:crypto";
import type { WorkspaceKey } from "@/db/schema";

export const DATE_FORMATS = ["DD/MM/YYYY", "DD-MM-YYYY", "YYYY-MM-DD", "DD MMM YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export type ParsedCsv = { headers: string[]; rows: string[][] };

/**
 * Parses CSV text into a header row and data rows. Bank statements often start with a few lines of
 * account details before the real table, so the header is the first row that has the most common
 * column count.
 */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, "");
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });
  const all = (result.data as unknown[])
    .filter((r): r is string[] => Array.isArray(r))
    .map((r) => r.map((c) => String(c ?? "").trim()));
  // Drop trailing empty cells so "a,b,c," and "a,b,c" look the same.
  const trimmed = all.map((r) => {
    const out = [...r];
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    return out;
  });
  const wide = trimmed.filter((r) => r.length >= 2);
  if (wide.length === 0) return { headers: [], rows: [] };
  const counts = new Map<number, number>();
  for (const r of wide) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
  let mode = wide[0].length;
  let best = 0;
  for (const [len, n] of counts) {
    if (n > best || (n === best && len > mode)) {
      mode = len;
      best = n;
    }
  }
  const headerIdx = trimmed.findIndex((r) => r.length === mode);
  const headers = trimmed[headerIdx];
  const rows = trimmed
    .slice(headerIdx + 1)
    // Keep rows that are close to the table width (some banks drop trailing empty columns).
    .filter((r) => r.length >= Math.max(2, mode - 2) && r.some((c) => c !== ""))
    .map((r) => {
      const out = [...r];
      while (out.length < mode) out.push("");
      return out.slice(0, mode);
    });
  return { headers, rows };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function fullYear(y: string): number {
  const n = Number(y);
  return y.length <= 2 ? 2000 + n : n;
}

function iso(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parses a statement date in the given format into "YYYY-MM-DD", or null when it does not fit. */
export function parseStatementDate(input: string, format: DateFormat): string | null {
  // Some banks add a time ("14/10/2026 10:32:11"); keep the date part.
  const s = String(input ?? "").trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i, "");
  if (!s) return null;
  let m: RegExpMatchArray | null;
  switch (format) {
    case "DD/MM/YYYY":
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
      return m ? iso(fullYear(m[3]), Number(m[2]), Number(m[1])) : null;
    case "DD-MM-YYYY":
      m = s.match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{2}|\d{4})$/);
      return m ? iso(fullYear(m[3]), Number(m[2]), Number(m[1])) : null;
    case "YYYY-MM-DD":
      m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      return m ? iso(Number(m[1]), Number(m[2]), Number(m[3])) : null;
    case "DD MMM YYYY": {
      m = s.match(/^(\d{1,2})[\s\-/]+([A-Za-z]{3,9})[\s\-/,]+(\d{2}|\d{4})$/);
      if (!m) return null;
      const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
      return mon ? iso(fullYear(m[3]), mon, Number(m[1])) : null;
    }
  }
}

/** Picks the date format that parses the most sample values (ties go to DD/MM/YYYY, the Indian default). */
export function detectDateFormat(samples: string[]): DateFormat {
  const vals = samples.map((s) => s.trim()).filter(Boolean);
  let best: DateFormat = "DD/MM/YYYY";
  let bestN = -1;
  for (const f of DATE_FORMATS) {
    const n = vals.filter((v) => parseStatementDate(v, f) != null).length;
    if (n > bestN) {
      best = f;
      bestN = n;
    }
  }
  return best;
}

/**
 * Parses a statement amount into signed paise. Handles Indian grouping ("1,23,456.78"), currency
 * marks ("₹", "Rs.", "INR"), brackets and trailing minus for negatives, and "Dr"/"Cr" suffixes
 * (Dr = money out, negative). Returns null when empty or not a number.
 */
export function parseStatementAmount(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (s === "" || s === "-" || s === "--") return null;
  let negative = false;
  const drcr = s.match(/\s*\b(dr|cr)\.?$/i);
  if (drcr) {
    if (drcr[1].toLowerCase() === "dr") negative = true;
    s = s.slice(0, drcr.index).trim();
  }
  if (/^\(.*\)$/.test(s)) {
    negative = !negative;
    s = s.slice(1, -1);
  }
  s = s.replace(/₹|inr|rs\.?/gi, "").replace(/[,\s]/g, "");
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const paise = Math.round(Number(s) * 100);
  return negative ? -paise : paise;
}

export type ColumnMapping = {
  date: number;
  description: number;
  dateFormat: DateFormat;
  /** "split" = separate debit and credit columns; "signed" = one amount column, negative = money out */
  amountMode: "split" | "signed";
  debit?: number | null;
  credit?: number | null;
  amount?: number | null;
  /** For signed amounts: flip the sign (some cards export spends as positive numbers) */
  invertSign?: boolean;
  reference?: number | null;
};

export type StatementLine = {
  /** Index into the parsed data rows */
  row: number;
  date: string | null;
  description: string;
  reference: string | null;
  /** Always positive */
  amountPaise: number;
  type: "income" | "expense";
  error: string | null;
};

const cell = (r: string[], i: number | null | undefined) => (i == null || i < 0 ? "" : (r[i] ?? ""));

/** Turns raw rows into dated, signed lines using the column mapping. Bad rows keep an error message. */
export function normaliseRows(rows: string[][], map: ColumnMapping): StatementLine[] {
  return rows.map((r, row) => {
    const date = parseStatementDate(cell(r, map.date), map.dateFormat);
    const description = cell(r, map.description).replace(/\s+/g, " ").trim();
    const reference = cell(r, map.reference) || null;
    let signed: number | null = null;
    if (map.amountMode === "split") {
      const debit = parseStatementAmount(cell(r, map.debit));
      const credit = parseStatementAmount(cell(r, map.credit));
      if (debit != null && debit !== 0) signed = -Math.abs(debit);
      else if (credit != null && credit !== 0) signed = Math.abs(credit);
    } else {
      const a = parseStatementAmount(cell(r, map.amount));
      if (a != null && a !== 0) signed = map.invertSign ? -a : a;
    }
    let error: string | null = null;
    if (!date) error = "Date not recognised";
    else if (signed == null) error = "No amount";
    return {
      row,
      date,
      description,
      reference,
      amountPaise: signed == null ? 0 : Math.abs(signed),
      type: signed != null && signed > 0 ? "income" : "expense",
      error,
    };
  });
}

export type MatchableCategory = {
  id: string;
  kind: "income" | "expense";
  matchKeywords: string[];
  archived?: boolean;
  workspace?: WorkspaceKey | null;
};

/**
 * Suggests a category by keyword (case-insensitive substring). The longest matching keyword wins,
 * so "credit card" beats "card". Only categories of the same kind are considered.
 */
export function suggestCategory<C extends MatchableCategory>(description: string, type: "income" | "expense", categories: C[]): C | null {
  const text = description.toLowerCase();
  let best: C | null = null;
  let bestLen = 0;
  for (const c of categories) {
    if (c.archived || c.kind !== type) continue;
    for (const raw of c.matchKeywords) {
      const kw = raw.trim().toLowerCase();
      if (kw && text.includes(kw) && kw.length > bestLen) {
        best = c;
        bestLen = kw.length;
      }
    }
  }
  return best;
}

/** Workspace for an imported line: the category's workspace, else the account's, else the chosen default. */
export function suggestWorkspace(categoryWs: WorkspaceKey | null | undefined, accountWs: WorkspaceKey | null | undefined, fallback: WorkspaceKey): WorkspaceKey {
  return categoryWs ?? accountWs ?? fallback;
}

/** sha256(accountId|date|signedAmount|description). Stable across re-imports of the same statement. */
export function importHash(accountId: string, date: string, signedAmountPaise: number, description: string, occurrence = 1): string {
  const base = `${accountId}|${date}|${signedAmountPaise}|${description.replace(/\s+/g, " ").trim().toLowerCase()}`;
  return createHash("sha256").update(occurrence > 1 ? `${base}|${occurrence}` : base).digest("hex");
}

/**
 * Hashes for a batch of lines. Two identical lines in one statement (two ₹10 charges on the same day)
 * get distinct hashes by counting occurrences, so both import, while re-importing still dedupes.
 */
export function batchImportHashes(accountId: string, lines: { date: string; amountPaise: number; type: "income" | "expense"; description: string }[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const signed = l.type === "income" ? l.amountPaise : -l.amountPaise;
    const key = `${l.date}|${signed}|${l.description.replace(/\s+/g, " ").trim().toLowerCase()}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return importHash(accountId, l.date, signed, l.description, n);
  });
}

/** Guesses the column mapping from header names. */
export function guessMapping(headers: string[], rows: string[][]): ColumnMapping {
  const h = headers.map((x) => x.toLowerCase());
  // Needles are tried in priority order; short ones ("dr", "cr") must be whole words.
  const find = (...needles: string[]) => {
    for (const n of needles) {
      const i = h.findIndex((x) => (n.length <= 3 ? x.split(/[^a-z]+/).includes(n) : x.includes(n)));
      if (i >= 0) return i;
    }
    return -1;
  };
  let date = find("txn date", "transaction date", "tran date", "value date", "date");
  if (date < 0) date = 0;
  let description = find("narration", "description", "particulars", "remarks", "details");
  if (description < 0) description = Math.min(1, headers.length - 1);
  const debit = find("withdrawal", "debit", "dr amount", "paid out", "dr");
  const credit = find("deposit", "credit", "cr amount", "paid in", "cr");
  const amount = find("amount", "amt");
  const reference = find("ref", "chq", "cheque", "utr");
  const dateFormat = detectDateFormat(rows.slice(0, 30).map((r) => r[date] ?? ""));
  const split = debit >= 0 && credit >= 0 && debit !== credit;
  return {
    date,
    description,
    dateFormat,
    amountMode: split ? "split" : "signed",
    debit: split ? debit : null,
    credit: split ? credit : null,
    amount: split ? null : amount >= 0 ? amount : null,
    invertSign: false,
    reference: reference >= 0 && reference !== date && reference !== description ? reference : null,
  };
}
