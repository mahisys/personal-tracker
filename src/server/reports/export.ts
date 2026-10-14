import "server-only";
import ExcelJS from "exceljs";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import * as s from "@/db/schema";

/** Business tables exported, one sheet each, in a friendly order. */
const SHEETS: { name: string; table: PgTable }[] = [
  { name: "Tasks", table: s.tasks },
  { name: "Projects", table: s.projects },
  { name: "Milestones", table: s.milestones },
  { name: "Time entries", table: s.timeEntries },
  { name: "Leads", table: s.leads },
  { name: "Lead stages", table: s.leadStages },
  { name: "Contacts", table: s.contacts },
  { name: "Companies", table: s.companies },
  { name: "Activities", table: s.activities },
  { name: "Sales targets", table: s.salesTargets },
  { name: "Quotes", table: s.quotes },
  { name: "Invoices", table: s.invoices },
  { name: "Line items", table: s.lineItems },
  { name: "Invoice payments", table: s.invoicePayments },
  { name: "Accounts", table: s.accounts },
  { name: "Categories", table: s.categories },
  { name: "Transactions", table: s.transactions },
  { name: "Bills", table: s.bills },
  { name: "Renewals", table: s.renewals },
  { name: "Borrowers", table: s.borrowers },
  { name: "Loan files", table: s.loanFiles },
  { name: "Loan stage history", table: s.loanStageHistory },
  { name: "Loan documents", table: s.loanDocuments },
  { name: "Lenders", table: s.lenders },
  { name: "Payout grid", table: s.payoutRates },
  { name: "Payouts", table: s.payouts },
  { name: "Sub-connectors", table: s.subConnectors },
];

export type ColumnSpec = { key: string; header: string; kind: "money" | "percent" | "date" | "datetime" | "number" | "text" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "amountPaise" → "Amount (₹)", "gstRateBps" → "Gst rate (%)", "dueDate" → "Due date". Pure. */
export function describeColumn(key: string, sample: unknown): ColumnSpec {
  const words = (k: string) => {
    const w = k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  };
  if (/Paise$/.test(key)) return { key, header: `${words(key.replace(/Paise$/, "")) || "Amount"} (₹)`, kind: "money" };
  if (/Bps$/.test(key)) return { key, header: `${words(key.replace(/Bps$/, ""))} (%)`, kind: "percent" };
  if (sample instanceof Date || /At$/.test(key)) return { key, header: words(key), kind: "datetime" };
  if (typeof sample === "string" && DAY_RE.test(sample)) return { key, header: words(key), kind: "date" };
  if (typeof sample === "number") return { key, header: words(key), kind: "number" };
  return { key, header: words(key), kind: "text" };
}

/** Converts one value for Excel: paise → rupees, bps → fraction, IST days → dates, arrays/objects → text. Pure. */
export function cellValue(spec: ColumnSpec, v: unknown): ExcelJS.CellValue {
  if (v == null) return null;
  switch (spec.kind) {
    case "money":
      return Number(v) / 100;
    case "percent":
      return Number(v) / 10000;
    case "date":
      return typeof v === "string" && DAY_RE.test(v) ? new Date(`${v}T00:00:00Z`) : String(v);
    case "datetime":
      // Excel has no time zones: show the IST wall-clock time.
      return v instanceof Date ? new Date(v.getTime() + 330 * 60_000) : v ? String(v) : null;
    default:
      if (Array.isArray(v)) return v.join(", ");
      if (typeof v === "object") return JSON.stringify(v);
      if (typeof v === "boolean") return v ? "Yes" : "No";
      return v as ExcelJS.CellValue;
  }
}

const FORMATS: Record<ColumnSpec["kind"], string | undefined> = {
  money: '"₹"#,##0.00;[Red]-"₹"#,##0.00',
  percent: "0.00%",
  date: "dd mmm yyyy",
  datetime: "dd mmm yyyy hh:mm",
  number: undefined,
  text: undefined,
};

export async function buildWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Command Center";
  wb.created = new Date();
  for (const { name, table } of SHEETS) {
    const rows = (await db.select().from(table)) as Record<string, unknown>[];
    const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }], properties: { tabColor: { argb: "FF6D5DF6" } } });
    const keys = rows.length ? Object.keys(rows[0]) : [];
    const specs = keys.map((k) => describeColumn(k, rows.find((r) => r[k] != null)?.[k]));
    ws.columns = specs.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.min(48, Math.max(12, c.header.length + 4, c.kind === "text" ? 22 : 14)),
      style: FORMATS[c.kind] ? { numFmt: FORMATS[c.kind] } : {},
    }));
    for (const r of rows) ws.addRow(Object.fromEntries(specs.map((c) => [c.key, cellValue(c, r[c.key])])));
    if (!rows.length) ws.addRow(["No records yet"]);
    const header = ws.getRow(1);
    header.height = 22;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D5DF6" } };
      cell.alignment = { vertical: "middle" };
      cell.border = { bottom: { style: "thin", color: { argb: "FF4F46E5" } } };
    });
    if (specs.length && rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: specs.length } };
  }
  return wb;
}
