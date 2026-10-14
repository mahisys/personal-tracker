import "server-only";
import PDFDocument from "pdfkit";
import type { invoices, lineItems } from "@/db/schema";
import { formatDay } from "@/lib/dates";
import { INDIAN_STATES, lineTaxable } from "@/lib/gst";
import type { AppSettings } from "@/server/settings";
import { amountInWords } from "./words";

type Invoice = typeof invoices.$inferSelect;
type Item = typeof lineItems.$inferSelect;

/** Helvetica has no ₹ glyph, so the PDF writes "Rs." with Indian digit grouping. */
export function pdfMoney(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const s = String(rupees);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}Rs. ${rest ? `${rest},${last3}` : last3}.${String(p).padStart(2, "0")}`;
}

function stateName(code: string | null | undefined): string {
  if (!code) return "";
  const s = INDIAN_STATES.find((x) => x.code === code);
  return s ? `${s.name} (${code})` : code;
}

function qtyText(q: number): string {
  return Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3)));
}

const INK = "#1d1b3a";
const MUTED = "#6b6889";
const BRAND = "#5b4be0";
const LINE = "#dcd9f0";
const SOFT = "#f3f1ff";

/** Renders a GST tax invoice as a PDF buffer. */
export function renderInvoicePdf(inv: Invoice, items: Item[], settings: AppSettings): Promise<Buffer> {
  const b = settings.business;
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: `Invoice ${inv.number}`, Author: b.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const L = 40;
  const R = doc.page.width - 40;
  const W = R - L;

  // ---- Header band
  doc.rect(0, 0, doc.page.width, 6).fill(BRAND);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text(b.name || "Invoice", L, 34, { width: W / 2 });
  if (b.legalName && b.legalName !== b.name) doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(b.legalName, { width: W / 2 });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  const sellerLines = [
    b.address,
    b.stateCode ? `State: ${stateName(b.stateCode)}` : "",
    b.gstin ? `GSTIN: ${b.gstin}` : "",
    b.pan ? `PAN: ${b.pan}` : "",
    [b.phone, b.email].filter(Boolean).join("  |  "),
  ].filter(Boolean);
  doc.text(sellerLines.join("\n"), { width: W / 2 });
  const sellerBottom = doc.y;

  doc.font("Helvetica-Bold").fontSize(16).fillColor(BRAND).text("TAX INVOICE", L + W / 2, 34, { width: W / 2, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("Original for recipient", { width: W / 2, align: "right" });
  doc.moveDown(0.6);
  const meta: [string, string][] = [
    ["Invoice no.", inv.number],
    ["Invoice date", formatDay(inv.issueDate)],
    ["Due date", formatDay(inv.dueDate)],
    ["Place of supply", stateName(inv.placeOfSupply) || "-"],
  ];
  for (const [k, v] of meta) {
    const y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(k, L + W / 2, y, { width: W / 4, align: "right" });
    doc.font("Helvetica-Bold").fillColor(INK).text(v, L + (3 * W) / 4, y, { width: W / 4, align: "right" });
  }
  let y = Math.max(sellerBottom, doc.y) + 16;

  // ---- Bill to
  const bt = inv.billTo;
  const billLines = [bt.address, bt.stateCode ? `State: ${stateName(bt.stateCode)}` : "", bt.gstin ? `GSTIN: ${bt.gstin}` : "", bt.email ?? ""].filter(Boolean);
  doc.font("Helvetica").fontSize(9);
  const billH = 34 + doc.heightOfString(billLines.join("\n") || " ", { width: W - 24 });
  doc.roundedRect(L, y, W, billH, 6).fill(SOFT);
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("BILL TO", L + 12, y + 10);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(bt.name, L + 12, y + 21, { width: W - 24 });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(billLines.join("\n"), { width: W - 24 });
  y += billH + 18;

  // ---- Items table
  const cols = [
    { key: "#", w: 20, align: "left" as const },
    { key: "Description", w: 0, align: "left" as const },
    { key: "HSN/SAC", w: 52, align: "left" as const },
    { key: "Qty", w: 36, align: "right" as const },
    { key: "Rate", w: 72, align: "right" as const },
    { key: "Taxable value", w: 80, align: "right" as const },
    { key: "GST %", w: 38, align: "right" as const },
  ];
  cols[1].w = W - cols.reduce((s, c) => s + c.w, 0) - 6 * cols.length;
  const drawRow = (cells: string[], yy: number, opts: { bold?: boolean; color?: string } = {}) => {
    let x = L + 6;
    let h = 0;
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(opts.color ?? INK);
    cols.forEach((c, i) => {
      doc.text(cells[i], x, yy, { width: c.w, align: c.align });
      h = Math.max(h, doc.heightOfString(cells[i], { width: c.w }));
      x += c.w + 6;
    });
    return h;
  };
  doc.rect(L, y, W, 22).fill(INK);
  drawRow(cols.map((c) => c.key), y + 7, { bold: true, color: "#ffffff" });
  y += 28;
  items.forEach((it, i) => {
    const cells = [
      String(i + 1),
      it.description,
      it.hsnSac ?? "",
      qtyText(Number(it.quantity)),
      pdfMoney(it.unitPricePaise),
      pdfMoney(lineTaxable({ quantity: Number(it.quantity), unitPricePaise: it.unitPricePaise, gstRateBps: it.gstRateBps })),
      `${it.gstRateBps / 100}%`,
    ];
    doc.font("Helvetica").fontSize(9);
    const h = doc.heightOfString(it.description, { width: cols[1].w });
    if (y + h + 10 > doc.page.height - 200) {
      doc.addPage();
      y = 50;
    }
    drawRow(cells, y);
    y += h + 8;
    doc.moveTo(L, y - 3).lineTo(R, y - 3).lineWidth(0.5).strokeColor(LINE).stroke();
  });

  // ---- Totals
  y += 8;
  if (y > doc.page.height - 260) {
    doc.addPage();
    y = 50;
  }
  const totals: [string, string, boolean?][] = [["Taxable value", pdfMoney(inv.subtotalPaise)]];
  if (inv.interstate) totals.push(["IGST", pdfMoney(inv.igstPaise)]);
  else totals.push(["CGST", pdfMoney(inv.cgstPaise)], ["SGST", pdfMoney(inv.sgstPaise)]);
  totals.push(["Total", pdfMoney(inv.totalPaise), true]);
  if (inv.paidPaise > 0) totals.push(["Received", pdfMoney(inv.paidPaise)], ["Balance due", pdfMoney(Math.max(0, inv.totalPaise - inv.paidPaise)), true]);
  const tx = L + W / 2;
  const tw = W / 2;
  const totalsTop = y;
  for (const [k, v, strong] of totals) {
    if (strong) {
      doc.rect(tx, y - 4, tw, 20).fill(SOFT);
    }
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 10.5 : 9.5).fillColor(strong ? INK : MUTED).text(k, tx + 8, y, { width: tw / 2 });
    doc.fillColor(INK).text(v, tx + tw / 2, y, { width: tw / 2 - 8, align: "right" });
    y += strong ? 22 : 16;
  }

  // Amount in words, left of totals
  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text("AMOUNT IN WORDS", L, totalsTop, { width: W / 2 - 16 });
  doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(amountInWords(inv.totalPaise), L, doc.y + 2, { width: W / 2 - 16 });
  y = Math.max(y, doc.y) + 18;

  // ---- Bank details + terms
  const bank = [
    b.bankName ? `Bank: ${b.bankName}` : "",
    b.bankAccountNo ? `A/c no.: ${b.bankAccountNo}` : "",
    b.bankIfsc ? `IFSC: ${b.bankIfsc}` : "",
    b.upiId ? `UPI: ${b.upiId}` : "",
    b.legalName || b.name ? `A/c name: ${b.legalName || b.name}` : "",
  ].filter(Boolean);
  if (bank.length > 1) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text("PAYMENT DETAILS", L, y);
    doc.font("Helvetica").fontSize(9).fillColor(INK).text(bank.join("\n"), L, doc.y + 2, { width: W / 2 - 16 });
  }
  const leftBottom = doc.y;
  const terms = [inv.terms, inv.notes].filter((s) => s && s.trim()).join("\n\n");
  if (terms) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text("TERMS & NOTES", tx, y);
    doc.font("Helvetica").fontSize(9).fillColor(INK).text(terms, tx, doc.y + 2, { width: tw });
  }
  y = Math.max(leftBottom, doc.y) + 30;

  // ---- Signature + footer
  if (y > doc.page.height - 110) {
    doc.addPage();
    y = 60;
  }
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`For ${b.legalName || b.name}`, tx, y, { width: tw, align: "right" });
  doc.moveTo(R - 150, y + 44).lineTo(R, y + 44).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.text("Authorised signatory", tx, y + 48, { width: tw, align: "right" });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
    .text("This is a computer-generated invoice and does not require a physical signature.", L, doc.page.height - 56, { width: W, align: "center" });

  doc.end();
  return finished;
}
