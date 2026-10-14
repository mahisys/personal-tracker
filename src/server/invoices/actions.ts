"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { accounts, invoices, invoicePayments, quotes } from "@/db/schema";
import { day, done, fail, str, type ActionResult } from "@/lib/action";
import { addDays, todayIST } from "@/lib/dates";
import { isValidGstin } from "@/lib/gst";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { parseWorkspace } from "@/server/workspace";
import { logActivity } from "@/server/activity";
import { parseItemsJson } from "./lines";
import { insertInvoice, PaymentError, recordPayment, updateInvoiceRecord, writeLineItems, type InvoiceInput } from "./core";

function revalidateInvoices(id?: string) {
  revalidatePath("/invoices");
  if (id) revalidatePath(`/invoices/${id}`);
  revalidatePath("/sales");
  revalidatePath("/");
}

async function readInvoiceForm(form: FormData): Promise<{ ok: true; input: InvoiceInput } | { ok: false; error: string }> {
  const settings = await getSettings();
  const parsed = parseItemsJson(str(form, "items"));
  if (!parsed.ok) return parsed;
  const name = str(form, "billToName");
  if (!name) return { ok: false, error: "Who is this invoice for? Add the client name" };
  const gstin = str(form, "billToGstin")?.toUpperCase() ?? null;
  if (gstin && !isValidGstin(gstin)) return { ok: false, error: "That GSTIN doesn't look right (15 characters, e.g. 27ABCDE1234F1Z5)" };
  const issueDate = day(form, "issueDate") ?? todayIST();
  const dueDate = day(form, "dueDate") ?? addDays(issueDate, settings.business.defaultPaymentTermsDays);
  if (dueDate < issueDate) return { ok: false, error: "The due date can't be before the issue date" };
  const placeOfSupply = str(form, "placeOfSupply");
  return {
    ok: true,
    input: {
      workspace: parseWorkspace(str(form, "workspace")),
      companyId: str(form, "companyId"),
      contactId: str(form, "contactId"),
      projectId: str(form, "projectId"),
      billTo: {
        name,
        gstin,
        address: str(form, "billToAddress") ?? "",
        stateCode: str(form, "billToState") ?? placeOfSupply,
        email: str(form, "billToEmail"),
      },
      issueDate,
      dueDate,
      placeOfSupply,
      notes: str(form, "notes") ?? "",
      terms: str(form, "terms") ?? "",
      items: parsed.items,
    },
  };
}

export async function saveInvoice(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const r = await readInvoiceForm(form);
  if (!r.ok) return fail(r.error);
  const settings = await getSettings();
  const id = str(form, "id");
  if (id) {
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!existing) return fail("Invoice not found");
    if (existing.status !== "draft") return fail("Only draft invoices can be edited");
    await db.transaction((tx) => updateInvoiceRecord(tx, id, r.input, settings));
    revalidateInvoices(id);
    return done("Invoice saved", { redirectTo: `/invoices/${id}` });
  }
  const row = await db.transaction((tx) => insertInvoice(tx, r.input, settings));
  revalidateInvoices(row.id);
  return done(`Invoice ${row.number} created`, { redirectTo: `/invoices/${row.id}` });
}

export async function markInvoiceSent(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Invoice not found");
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) return fail("Invoice not found");
  if (inv.status !== "draft") return fail("This invoice has already been sent");
  if (inv.totalPaise <= 0) return fail("Add at least one priced line before sending");
  await db.update(invoices).set({ status: "sent", sentAt: new Date() }).where(eq(invoices.id, id));
  await logActivity("invoice", id, "sent", `Marked as sent`);
  revalidateInvoices(id);
  return done("Nice — invoice sent");
}

export async function recordInvoicePayment(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const invoiceId = str(form, "invoiceId");
  const accountId = str(form, "accountId");
  const amountPaise = parseRupeesToPaise(str(form, "amount"));
  const tdsPaise = parseRupeesToPaise(str(form, "tds")) ?? 0;
  const date = day(form, "date") ?? todayIST();
  if (!invoiceId) return fail("Invoice not found");
  if (!accountId) return fail("Which account did the money land in?");
  if (amountPaise == null || amountPaise <= 0) return fail("Enter the amount received");
  const [acct] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId));
  if (!acct) return fail("Choose an account");
  try {
    const r = await db.transaction((tx) =>
      recordPayment(tx, { invoiceId, accountId, amountPaise, tdsPaise, date, mode: str(form, "mode"), reference: str(form, "reference") }),
    );
    revalidateInvoices(invoiceId);
    revalidatePath("/books");
    return r.fullyPaid
      ? done(`Paid in full — ${r.invoice.number} is settled 🎉`, { celebrate: true })
      : done(`Payment of ${formatINR(amountPaise)} recorded`);
  } catch (e) {
    if (e instanceof PaymentError || (e instanceof Error && /Amount must be/.test(e.message))) return fail(e.message);
    throw e;
  }
}

export async function cancelInvoice(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Invoice not found");
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) return fail("Invoice not found");
  if (inv.paidPaise > 0) return fail("This invoice has payments recorded — it can't be cancelled");
  await db.update(invoices).set({ status: "cancelled" }).where(eq(invoices.id, id));
  await logActivity("invoice", id, "cancelled", "Invoice cancelled");
  revalidateInvoices(id);
  return done("Invoice cancelled");
}

export async function deleteDraftInvoice(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Invoice not found");
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) return fail("Invoice not found");
  if (inv.status !== "draft") return fail("Only drafts can be deleted — cancel it instead");
  const payments = await db.select({ id: invoicePayments.id }).from(invoicePayments).where(eq(invoicePayments.invoiceId, id)).limit(1);
  if (payments.length) return fail("This invoice has payments recorded");
  await db.transaction(async (tx) => {
    await tx.update(quotes).set({ invoiceId: null }).where(eq(quotes.invoiceId, id));
    await writeLineItems(tx, "invoice", id, []);
    await tx.delete(invoices).where(eq(invoices.id, id));
  });
  revalidateInvoices();
  return done("Draft deleted", { redirectTo: "/invoices" });
}
