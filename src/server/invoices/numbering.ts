/**
 * Document numbering per Indian financial year: `${prefix}/${2026-27}/${001}`.
 * The sequence restarts every April. Callers run nextDocNumber inside a transaction; an advisory lock
 * serialises concurrent creations so two documents never get the same number.
 */
import { like, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { invoices, quotes } from "@/db/schema";
import { financialYear } from "@/lib/dates";

/** "2026-10-14" → "2026-27" */
export function fyCode(day: string): string {
  return financialYear(day).label.replace(/^FY\s*/, "");
}

export function formatDocNumber(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy}/${String(seq).padStart(3, "0")}`;
}

/** Highest sequence among existing numbers that share the prefix and FY. */
export function maxSeq(numbers: string[], prefix: string, fy: string): number {
  const base = `${prefix}/${fy}/`;
  let max = 0;
  for (const n of numbers) {
    if (!n.startsWith(base)) continue;
    const tail = n.slice(base.length);
    if (/^\d+$/.test(tail)) max = Math.max(max, Number(tail));
  }
  return max;
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function nextDocNumber(conn: DbOrTx, kind: "invoice" | "quote", prefix: string, issueDate: string): Promise<string> {
  const p = (prefix || (kind === "invoice" ? "INV" : "QT")).trim();
  const fy = fyCode(issueDate);
  const base = `${p}/${fy}/`;
  await conn.execute(sql`select pg_advisory_xact_lock(hashtext(${`${kind}:${base}`}))`);
  const table = kind === "invoice" ? invoices : quotes;
  const rows = await conn.select({ number: table.number }).from(table).where(like(table.number, `${escapeLike(base)}%`));
  return formatDocNumber(p, fy, maxSeq(rows.map((r) => r.number), p, fy) + 1);
}
