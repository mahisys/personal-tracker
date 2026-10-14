import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { categories, invoicePayments, invoices, lineItems, transactions, type WorkspaceKey } from "@/db/schema";
import { computeGst, isInterstate } from "@/lib/gst";
import { formatINR } from "@/lib/money";
import { createTransaction } from "@/server/ledger";
import { logActivity } from "@/server/activity";
import type { AppSettings } from "@/server/settings";
import { nextDocNumber } from "./numbering";
import type { ParsedItem } from "./lines";

export type BillTo = { name: string; gstin?: string | null; address?: string; stateCode?: string | null; email?: string | null };

export type InvoiceInput = {
  workspace: WorkspaceKey;
  companyId?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  quoteId?: string | null;
  leadId?: string | null;
  billTo: BillTo;
  issueDate: string;
  dueDate: string;
  placeOfSupply?: string | null;
  notes?: string;
  terms?: string;
  items: ParsedItem[];
};

function totalsFor(items: ParsedItem[], interstate: boolean) {
  const t = computeGst(items, interstate);
  return {
    interstate,
    subtotalPaise: t.subtotalPaise,
    cgstPaise: t.cgstPaise,
    sgstPaise: t.sgstPaise,
    igstPaise: t.igstPaise,
    totalPaise: t.totalPaise,
  };
}

async function writeItems(conn: DbOrTx, docType: "invoice" | "quote", docId: string, items: ParsedItem[]) {
  await conn.delete(lineItems).where(and(eq(lineItems.docType, docType), eq(lineItems.docId, docId)));
  if (items.length === 0) return;
  await conn.insert(lineItems).values(
    items.map((it, i) => ({
      docType,
      docId,
      description: it.description,
      hsnSac: it.hsnSac,
      quantity: it.quantity,
      unitPricePaise: it.unitPricePaise,
      gstRateBps: it.gstRateBps,
      sort: i,
    })),
  );
}
export { writeItems as writeLineItems };

export async function getLineItems(conn: DbOrTx, docType: "invoice" | "quote", docId: string) {
  return conn
    .select()
    .from(lineItems)
    .where(and(eq(lineItems.docType, docType), eq(lineItems.docId, docId)))
    .orderBy(asc(lineItems.sort));
}

/** Creates a draft invoice with a fresh FY number. Call inside a transaction. */
export async function insertInvoice(conn: DbOrTx, input: InvoiceInput, settings: AppSettings) {
  const number = await nextDocNumber(conn, "invoice", settings.business.invoicePrefix, input.issueDate);
  const interstate = isInterstate(settings.business.stateCode, input.placeOfSupply);
  const [row] = await conn
    .insert(invoices)
    .values({
      workspace: input.workspace,
      number,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      projectId: input.projectId ?? null,
      quoteId: input.quoteId ?? null,
      leadId: input.leadId ?? null,
      billTo: input.billTo,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      status: "draft",
      placeOfSupply: input.placeOfSupply ?? null,
      notes: input.notes ?? "",
      terms: input.terms ?? settings.business.defaultInvoiceTerms ?? "",
      ...totalsFor(input.items, interstate),
    })
    .returning();
  await writeItems(conn, "invoice", row.id, input.items);
  await logActivity("invoice", row.id, "created", `Invoice ${number} created for ${formatINR(row.totalPaise)}`, null, conn);
  return row;
}

/** Rewrites a draft invoice's details and items. */
export async function updateInvoiceRecord(conn: DbOrTx, id: string, input: InvoiceInput, settings: AppSettings) {
  const interstate = isInterstate(settings.business.stateCode, input.placeOfSupply);
  const [row] = await conn
    .update(invoices)
    .set({
      workspace: input.workspace,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      projectId: input.projectId ?? null,
      billTo: input.billTo,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      placeOfSupply: input.placeOfSupply ?? null,
      notes: input.notes ?? "",
      terms: input.terms ?? "",
      ...totalsFor(input.items, interstate),
    })
    .where(eq(invoices.id, id))
    .returning();
  await writeItems(conn, "invoice", id, input.items);
  await logActivity("invoice", id, "updated", `Invoice updated — total ${formatINR(row.totalPaise)}`, null, conn);
  return row;
}

export type PaymentInput = {
  invoiceId: string;
  date: string;
  amountPaise: number;
  tdsPaise: number;
  accountId: string;
  mode?: string | null;
  reference?: string | null;
};

/**
 * Records a payment against an invoice in one transaction:
 * invoice_payments row → income transaction in the books (with TDS and the proportional GST share)
 * → paidPaise and status updated. Returns the updated invoice and whether it is now fully paid.
 */
export async function recordPayment(conn: DbOrTx, p: PaymentInput) {
  const [inv] = await conn.select().from(invoices).where(eq(invoices.id, p.invoiceId)).for("update");
  if (!inv) throw new PaymentError("Invoice not found");
  if (inv.status === "cancelled") throw new PaymentError("This invoice is cancelled");
  if (p.amountPaise <= 0) throw new PaymentError("Enter the amount received");
  if (p.tdsPaise < 0) throw new PaymentError("TDS can't be negative");
  const credited = p.amountPaise + p.tdsPaise;
  const balance = inv.totalPaise - inv.paidPaise;
  if (balance <= 0) throw new PaymentError("This invoice is already fully paid");
  if (credited > balance) throw new PaymentError(`That's more than the balance of ${formatINR(balance)}`);

  const invoiceTax = inv.cgstPaise + inv.sgstPaise + inv.igstPaise;
  const newPaid = inv.paidPaise + credited;
  const fullyPaid = newPaid >= inv.totalPaise;
  let gstShare = inv.totalPaise > 0 ? Math.round((invoiceTax * credited) / inv.totalPaise) : 0;
  if (fullyPaid) {
    // Last payment takes whatever GST is left, so the shares add up exactly to the invoice GST.
    const [{ booked }] = await conn
      .select({ booked: sql<string>`coalesce(sum(${transactions.gstPaise}), 0)` })
      .from(transactions)
      .where(eq(transactions.invoiceId, inv.id));
    gstShare = Math.max(0, invoiceTax - Number(booked));
  }

  const [cat] = await conn
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, "Sales / services"), eq(categories.kind, "income")))
    .limit(1);

  const txn = await createTransaction(
    {
      workspace: inv.workspace,
      type: "income",
      date: p.date,
      accountId: p.accountId,
      amountPaise: p.amountPaise,
      tdsPaise: p.tdsPaise,
      gstPaise: gstShare,
      invoiceId: inv.id,
      categoryId: cat?.id ?? null,
      party: inv.billTo?.name ?? null,
      description: `Payment for invoice ${inv.number}`,
      reference: p.reference ?? null,
    },
    conn,
  );

  const [payment] = await conn
    .insert(invoicePayments)
    .values({
      invoiceId: inv.id,
      date: p.date,
      amountPaise: p.amountPaise,
      tdsPaise: p.tdsPaise,
      accountId: p.accountId,
      transactionId: txn.id,
      mode: p.mode ?? null,
      reference: p.reference ?? null,
    })
    .returning();

  const [updated] = await conn
    .update(invoices)
    .set({ paidPaise: newPaid, status: fullyPaid ? "paid" : "part_paid", sentAt: inv.sentAt ?? new Date() })
    .where(eq(invoices.id, inv.id))
    .returning();

  await logActivity(
    "invoice",
    inv.id,
    "payment",
    `Payment of ${formatINR(p.amountPaise)}${p.tdsPaise ? ` (+ ${formatINR(p.tdsPaise)} TDS)` : ""} recorded${fullyPaid ? " — fully paid" : ""}`,
    { paymentId: payment.id, transactionId: txn.id },
    conn,
  );
  return { invoice: updated, payment, transaction: txn, fullyPaid };
}

export class PaymentError extends Error {}
