"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { QUOTE_STATUSES, quotes, salesTargets, type QuoteStatus } from "@/db/schema";
import { day, done, fail, str, type ActionResult } from "@/lib/action";
import { addDays, monthKey, todayIST } from "@/lib/dates";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { parseWorkspace } from "@/server/workspace";
import { logActivity } from "@/server/activity";
import { parseItemsJson } from "@/server/invoices/lines";
import { writeLineItems } from "@/server/invoices/core";
import { insertQuote, invoiceFromQuote, updateQuoteRecord, type QuoteInput } from "./quote-core";

function revalidateQuotes(id?: string, leadId?: string | null) {
  revalidatePath("/sales/quotes");
  if (id) revalidatePath(`/sales/quotes/${id}`);
  if (leadId) revalidatePath(`/crm/leads/${leadId}`);
}

function readQuoteForm(form: FormData): { ok: true; input: QuoteInput } | { ok: false; error: string } {
  const parsed = parseItemsJson(str(form, "items"));
  if (!parsed.ok) return parsed;
  const issueDate = day(form, "issueDate") ?? todayIST();
  const validUntil = day(form, "validUntil") ?? addDays(issueDate, 15);
  if (validUntil < issueDate) return { ok: false, error: "“Valid until” can't be before the quote date" };
  if (!str(form, "companyId") && !str(form, "contactId") && !str(form, "leadId")) return { ok: false, error: "Pick who the quote is for — a company, contact or lead" };
  return {
    ok: true,
    input: {
      workspace: parseWorkspace(str(form, "workspace")),
      leadId: str(form, "leadId"),
      companyId: str(form, "companyId"),
      contactId: str(form, "contactId"),
      issueDate,
      validUntil,
      placeOfSupply: str(form, "placeOfSupply"),
      notes: str(form, "notes") ?? "",
      terms: str(form, "terms") ?? "",
      items: parsed.items,
    },
  };
}

export async function saveQuote(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const r = readQuoteForm(form);
  if (!r.ok) return fail(r.error);
  const settings = await getSettings();
  const id = str(form, "id");
  if (id) {
    const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
    if (!q) return fail("Quote not found");
    if (q.status !== "draft") return fail("Only draft quotes can be edited");
    await db.transaction((tx) => updateQuoteRecord(tx, id, r.input, settings));
    revalidateQuotes(id, r.input.leadId);
    return done("Quote saved", { redirectTo: `/sales/quotes/${id}` });
  }
  const row = await db.transaction((tx) => insertQuote(tx, r.input, settings));
  revalidateQuotes(row.id, row.leadId);
  return done(`Quote ${row.number} created`, { redirectTo: `/sales/quotes/${row.id}` });
}

const NEXT: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "expired", "draft"],
  accepted: ["sent"],
  rejected: ["sent"],
  expired: ["sent"],
};

export async function setQuoteStatus(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const status = str(form, "status") as QuoteStatus | null;
  if (!id || !status || !QUOTE_STATUSES.includes(status)) return fail("Choose a status");
  const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!q) return fail("Quote not found");
  if (q.invoiceId) return fail("This quote has already been invoiced");
  if (!NEXT[q.status].includes(status)) return fail(`A ${q.status} quote can't be marked ${status}`);
  if (status === "sent" && q.totalPaise <= 0) return fail("Add at least one priced line before sending");
  await db.update(quotes).set({ status }).where(eq(quotes.id, id));
  await logActivity("quote", id, "status", `Marked ${status}`);
  revalidateQuotes(id, q.leadId);
  const msg: Record<QuoteStatus, string> = {
    draft: "Back to draft",
    sent: "Quote sent — fingers crossed",
    accepted: "Accepted! Ready to invoice",
    rejected: "Marked rejected",
    expired: "Marked expired",
  };
  return done(msg[status], { celebrate: status === "accepted" });
}

export async function convertQuoteToInvoice(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Quote not found");
  const settings = await getSettings();
  const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!q) return fail("Quote not found");
  if (q.status !== "accepted") return fail("Mark the quote accepted before invoicing it");
  if (q.invoiceId) return done("Already invoiced", { redirectTo: `/invoices/${q.invoiceId}` });
  const inv = await db.transaction((tx) => invoiceFromQuote(tx, q, settings));
  revalidateQuotes(id, q.leadId);
  revalidatePath("/invoices");
  return done(`Draft invoice ${inv.number} created`, { redirectTo: `/invoices/${inv.id}` });
}

export async function deleteQuote(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Quote not found");
  const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!q) return fail("Quote not found");
  if (q.invoiceId) return fail("This quote has been invoiced and can't be deleted");
  await db.transaction(async (tx) => {
    await writeLineItems(tx, "quote", id, []);
    await tx.delete(quotes).where(eq(quotes.id, id));
  });
  revalidateQuotes(undefined, q.leadId);
  return done("Quote deleted", { redirectTo: "/sales/quotes" });
}

export async function saveSalesTarget(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const workspace = parseWorkspace(str(form, "workspace"));
  const month = str(form, "month") ?? monthKey(todayIST());
  if (!/^\d{4}-\d{2}$/.test(month)) return fail("Pick a month");
  const targetPaise = parseRupeesToPaise(str(form, "target"));
  if (targetPaise == null || targetPaise < 0) return fail("Enter the target in rupees");
  if (targetPaise === 0) {
    await db.delete(salesTargets).where(and(eq(salesTargets.workspace, workspace), eq(salesTargets.month, month)));
  } else {
    await db
      .insert(salesTargets)
      .values({ workspace, month, targetPaise })
      .onConflictDoUpdate({ target: [salesTargets.workspace, salesTargets.month], set: { targetPaise } });
  }
  revalidatePath("/sales");
  return done(targetPaise ? `Target set to ${formatINR(targetPaise, { whole: true })} — let's go!` : "Target cleared");
}
