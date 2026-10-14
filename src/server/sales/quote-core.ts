import "server-only";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { companies, contacts, quotes, type WorkspaceKey } from "@/db/schema";
import { addDays, todayIST } from "@/lib/dates";
import { computeGst, isInterstate } from "@/lib/gst";
import { formatINR } from "@/lib/money";
import { logActivity } from "@/server/activity";
import type { AppSettings } from "@/server/settings";
import { getLineItems, insertInvoice, writeLineItems, type BillTo } from "@/server/invoices/core";
import type { ParsedItem } from "@/server/invoices/lines";
import { nextDocNumber } from "@/server/invoices/numbering";

export type QuoteInput = {
  workspace: WorkspaceKey;
  leadId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  issueDate: string;
  validUntil?: string | null;
  placeOfSupply?: string | null;
  notes?: string;
  terms?: string;
  items: ParsedItem[];
};

function quoteTotals(items: ParsedItem[], interstate: boolean) {
  const t = computeGst(items, interstate);
  return { subtotalPaise: t.subtotalPaise, taxPaise: t.taxPaise, totalPaise: t.totalPaise };
}

export async function insertQuote(conn: DbOrTx, input: QuoteInput, settings: AppSettings) {
  const number = await nextDocNumber(conn, "quote", settings.business.quotePrefix, input.issueDate);
  const interstate = isInterstate(settings.business.stateCode, input.placeOfSupply);
  const [row] = await conn
    .insert(quotes)
    .values({
      workspace: input.workspace,
      number,
      leadId: input.leadId ?? null,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      issueDate: input.issueDate,
      validUntil: input.validUntil ?? null,
      placeOfSupply: input.placeOfSupply ?? null,
      notes: input.notes ?? "",
      terms: input.terms ?? "",
      ...quoteTotals(input.items, interstate),
    })
    .returning();
  await writeLineItems(conn, "quote", row.id, input.items);
  await logActivity("quote", row.id, "created", `Quote ${number} created for ${formatINR(row.totalPaise)}`, null, conn);
  return row;
}

export async function updateQuoteRecord(conn: DbOrTx, id: string, input: QuoteInput, settings: AppSettings) {
  const interstate = isInterstate(settings.business.stateCode, input.placeOfSupply);
  const [row] = await conn
    .update(quotes)
    .set({
      workspace: input.workspace,
      leadId: input.leadId ?? null,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      issueDate: input.issueDate,
      validUntil: input.validUntil ?? null,
      placeOfSupply: input.placeOfSupply ?? null,
      notes: input.notes ?? "",
      terms: input.terms ?? "",
      ...quoteTotals(input.items, interstate),
    })
    .where(eq(quotes.id, id))
    .returning();
  await writeLineItems(conn, "quote", id, input.items);
  await logActivity("quote", id, "updated", `Quote updated — total ${formatINR(row.totalPaise)}`, null, conn);
  return row;
}

/** Bill-to snapshot from a company (preferred) or contact. */
export async function billToFor(conn: DbOrTx, companyId: string | null, contactId: string | null, fallbackName: string): Promise<BillTo> {
  if (companyId) {
    const [c] = await conn.select().from(companies).where(eq(companies.id, companyId));
    if (c) {
      return {
        name: c.name,
        gstin: c.gstin,
        address: [c.address, c.city].filter((s) => s && s.trim()).join(", "),
        stateCode: c.stateCode,
        email: c.email,
      };
    }
  }
  if (contactId) {
    const [p] = await conn.select().from(contacts).where(eq(contacts.id, contactId));
    if (p) return { name: p.name, gstin: null, address: p.city ?? "", stateCode: null, email: p.email };
  }
  return { name: fallbackName, gstin: null, address: "", stateCode: null, email: null };
}

/**
 * Creates a draft invoice that copies a quote's line items and links the two (quote.invoiceId).
 * Call inside a transaction.
 */
export async function invoiceFromQuote(
  conn: DbOrTx,
  quote: typeof quotes.$inferSelect,
  settings: AppSettings,
  extra: { projectId?: string | null; leadId?: string | null } = {},
) {
  const items = await getLineItems(conn, "quote", quote.id);
  const billTo = await billToFor(conn, quote.companyId, quote.contactId, "Client");
  const issueDate = todayIST();
  const invoice = await insertInvoice(
    conn,
    {
      workspace: quote.workspace,
      companyId: quote.companyId,
      contactId: quote.contactId,
      projectId: extra.projectId ?? null,
      quoteId: quote.id,
      leadId: extra.leadId ?? quote.leadId,
      billTo,
      issueDate,
      dueDate: addDays(issueDate, settings.business.defaultPaymentTermsDays),
      placeOfSupply: quote.placeOfSupply ?? billTo.stateCode ?? settings.business.stateCode ?? null,
      notes: quote.notes,
      terms: settings.business.defaultInvoiceTerms,
      items: items.map((i, idx) => ({
        description: i.description,
        hsnSac: i.hsnSac,
        quantity: Number(i.quantity),
        unitPricePaise: i.unitPricePaise,
        gstRateBps: i.gstRateBps,
        sort: idx,
      })),
    },
    settings,
  );
  await conn.update(quotes).set({ invoiceId: invoice.id }).where(eq(quotes.id, quote.id));
  await logActivity("quote", quote.id, "converted", `Converted to invoice ${invoice.number}`, { invoiceId: invoice.id }, conn);
  return invoice;
}
