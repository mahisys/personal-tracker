"use server";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { ACCOUNT_TYPES, TRANSACTION_TYPES, accounts, bills, categories, transactions, type AccountType, type TransactionType, type WorkspaceKey, WORKSPACE_KEYS } from "@/db/schema";
import { bool, day, done, fail, str, type ActionResult } from "@/lib/action";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { todayIST } from "@/lib/dates";
import { logActivity } from "@/server/activity";
import { requireUser } from "@/server/auth";
import { createTransaction } from "@/server/ledger";
import { parseWorkspace } from "@/server/workspace";

function revalidateBooks(extra: string[] = []) {
  for (const p of ["/books", "/books/transactions", "/books/accounts", "/books/categories", "/planner", "/", ...extra]) revalidatePath(p);
}

function nonNegative(form: FormData, key: string): number | null | "bad" {
  const raw = str(form, key);
  if (raw == null) return null;
  const v = parseRupeesToPaise(raw);
  if (v == null || v < 0) return "bad";
  return v;
}

type ParsedTxn = {
  type: TransactionType;
  date: string;
  workspace: WorkspaceKey;
  accountId: string;
  transferAccountId: string | null;
  amountPaise: number;
  categoryId: string | null;
  party: string | null;
  description: string;
  gstPaise: number;
  tdsPaise: number;
  reference: string | null;
};

async function parseTxn(form: FormData): Promise<ParsedTxn | string> {
  const type = str(form, "type") as TransactionType | null;
  if (!type || !TRANSACTION_TYPES.includes(type)) return "Pick income, expense or transfer";
  const date = day(form, "date");
  if (!date) return "Pick a date";
  const amountPaise = parseRupeesToPaise(str(form, "amount"));
  if (amountPaise == null || amountPaise <= 0) return "Enter an amount greater than zero";
  const accountId = str(form, "accountId");
  if (!accountId) return "Pick an account";
  const transferAccountId = type === "transfer" ? str(form, "transferAccountId") : null;
  if (type === "transfer" && (!transferAccountId || transferAccountId === accountId)) return "A transfer needs two different accounts";
  const ids = [accountId, ...(transferAccountId ? [transferAccountId] : [])];
  const found = await db.select({ id: accounts.id }).from(accounts).where(or(...ids.map((i) => eq(accounts.id, i))));
  if (found.length !== new Set(ids).size) return "That account no longer exists";
  let categoryId = type === "transfer" ? null : str(form, "categoryId");
  if (categoryId) {
    const [c] = await db.select().from(categories).where(eq(categories.id, categoryId));
    if (!c) categoryId = null;
    else if (c.kind !== type) return `“${c.name}” is an ${c.kind} category`;
  }
  const gst = nonNegative(form, "gst");
  const tds = nonNegative(form, "tds");
  if (gst === "bad" || tds === "bad") return "GST and TDS must be amounts like 1800 or 0";
  return {
    type,
    date,
    workspace: parseWorkspace(form.get("workspace"), "personal"),
    accountId,
    transferAccountId,
    amountPaise,
    categoryId,
    party: str(form, "party"),
    description: str(form, "description") ?? "",
    gstPaise: gst ?? 0,
    tdsPaise: tds ?? 0,
    reference: str(form, "reference"),
  };
}

/** Creates a transaction (income, expense or transfer), or updates one when `id` is present. */
export async function saveTransaction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = await parseTxn(form);
  if (typeof parsed === "string") return fail(parsed);
  const id = str(form, "id");
  const label = parsed.type === "transfer" ? "Transfer" : parsed.type === "income" ? "Income" : "Expense";
  if (!id) {
    await createTransaction(parsed);
    revalidateBooks([`/books/accounts/${parsed.accountId}`]);
    return done(
      parsed.type === "income" ? `Nice — ${formatINR(parsed.amountPaise)} in` : parsed.type === "transfer" ? `Moved ${formatINR(parsed.amountPaise)}` : `${label} of ${formatINR(parsed.amountPaise)} saved`,
    );
  }
  const [existing] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!existing) return fail("That entry no longer exists");
  const moneyChanged =
    existing.amountPaise !== parsed.amountPaise || existing.type !== parsed.type || existing.accountId !== parsed.accountId || existing.transferAccountId !== parsed.transferAccountId;
  if ((existing.invoiceId || existing.payoutId) && moneyChanged) {
    return fail(existing.invoiceId ? "This entry is an invoice payment — change the amount on the invoice instead" : "This entry is a DSA payout — change it on the payout instead");
  }
  await db
    .update(transactions)
    .set({ ...parsed, transferAccountId: parsed.type === "transfer" ? parsed.transferAccountId : null })
    .where(eq(transactions.id, id));
  const changes: string[] = [];
  if (existing.amountPaise !== parsed.amountPaise) changes.push(`amount ${formatINR(existing.amountPaise)} → ${formatINR(parsed.amountPaise)}`);
  if (existing.date !== parsed.date) changes.push(`date ${existing.date} → ${parsed.date}`);
  if (existing.type !== parsed.type) changes.push(`type ${existing.type} → ${parsed.type}`);
  if (existing.categoryId !== parsed.categoryId) changes.push("category");
  if (existing.accountId !== parsed.accountId || existing.transferAccountId !== parsed.transferAccountId) changes.push("account");
  await logActivity("transaction", id, "updated", changes.length ? `Edited: ${changes.join(", ")}` : "Details edited", { before: existing });
  revalidateBooks([`/books/accounts/${parsed.accountId}`, `/books/accounts/${existing.accountId}`]);
  return done(`${label} updated`);
}

export async function deleteTransaction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing entry");
  const [t] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!t) return fail("That entry is already gone");
  if (t.invoiceId) return fail("This is an invoice payment — remove it from the invoice instead");
  if (t.payoutId) return fail("This is a DSA payout receipt — undo it from the payout instead");
  await db.transaction(async (tx) => {
    if (t.billId) await tx.update(bills).set({ paidTransactionId: null }).where(and(eq(bills.id, t.billId), eq(bills.paidTransactionId, t.id)));
    await tx.delete(transactions).where(eq(transactions.id, id));
    await logActivity("transaction", id, "deleted", `Deleted ${t.type} of ${formatINR(t.amountPaise)} (${t.date})`, { before: t }, tx);
  });
  revalidateBooks([`/books/accounts/${t.accountId}`]);
  return done("Entry deleted");
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function saveAccount(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return fail("Give the account a name");
  const type = str(form, "type") as AccountType | null;
  if (!type || !ACCOUNT_TYPES.includes(type)) return fail("Pick an account type");
  const wsRaw = str(form, "workspace");
  const workspace = wsRaw && WORKSPACE_KEYS.includes(wsRaw as WorkspaceKey) ? (wsRaw as WorkspaceKey) : null;
  const openingRaw = str(form, "openingBalance");
  let opening = openingRaw == null ? 0 : parseRupeesToPaise(openingRaw);
  if (opening == null) return fail("Opening balance should be a number like 25000 or -12000");
  // For cards and loans the form asks what you owe (positive); balances store it as negative.
  if ((type === "credit_card" || type === "loan") && bool(form, "owed") && opening !== 0) opening = -opening;
  const openingDate = day(form, "openingDate") ?? todayIST();
  const limitRaw = str(form, "creditLimit");
  const creditLimitPaise = limitRaw == null ? null : parseRupeesToPaise(limitRaw);
  if (limitRaw != null && (creditLimitPaise == null || creditLimitPaise < 0)) return fail("Credit limit should be an amount");
  const last4 = str(form, "last4");
  if (last4 && !/^\d{2,6}$/.test(last4)) return fail("Last digits should be 2–6 numbers");
  const values = {
    name,
    type,
    workspace,
    institution: str(form, "institution"),
    last4,
    openingBalancePaise: opening,
    openingDate,
    creditLimitPaise: type === "credit_card" || type === "loan" ? creditLimitPaise : null,
  };
  if (id) {
    const [row] = await db.update(accounts).set(values).where(eq(accounts.id, id)).returning();
    if (!row) return fail("That account no longer exists");
    await logActivity("account", id, "updated", "Account details edited");
    revalidateBooks([`/books/accounts/${id}`]);
    return done("Account updated");
  }
  const [row] = await db.insert(accounts).values(values).returning();
  await logActivity("account", row.id, "created", `Account “${name}” added`);
  revalidateBooks();
  return done(`“${name}” is ready`);
}

export async function toggleArchiveAccount(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing account");
  const [a] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!a) return fail("That account no longer exists");
  await db.update(accounts).set({ archived: !a.archived }).where(eq(accounts.id, id));
  await logActivity("account", id, a.archived ? "restored" : "archived", a.archived ? "Account restored" : "Account archived");
  revalidateBooks([`/books/accounts/${id}`]);
  return done(a.archived ? "Account restored" : "Account archived — its history stays in your books");
}

export async function deleteAccount(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing account");
  const used = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(or(eq(transactions.accountId, id), eq(transactions.transferAccountId, id)))
    .limit(1);
  if (used.length) return fail("This account has entries — archive it instead");
  await db.delete(accounts).where(eq(accounts.id, id));
  revalidateBooks();
  return done("Account deleted", { redirectTo: "/books/accounts" });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** "Swiggy, Zomato ,  cafe" → ["swiggy", "zomato", "cafe"] */
function parseKeywords(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean))];
}

export async function saveCategory(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return fail("Give the category a name");
  const kind = str(form, "kind");
  if (kind !== "income" && kind !== "expense") return fail("Pick income or expense");
  const wsRaw = str(form, "workspace");
  const workspace = wsRaw && WORKSPACE_KEYS.includes(wsRaw as WorkspaceKey) ? (wsRaw as WorkspaceKey) : null;
  const budgetRaw = str(form, "budget");
  const monthlyBudgetPaise = budgetRaw == null ? null : parseRupeesToPaise(budgetRaw);
  if (budgetRaw != null && (monthlyBudgetPaise == null || monthlyBudgetPaise < 0)) return fail("Budget should be an amount like 15000");
  const values = { name, kind: kind as "income" | "expense", workspace, monthlyBudgetPaise: monthlyBudgetPaise || null, matchKeywords: parseKeywords(str(form, "keywords")) };
  if (id) {
    const [row] = await db.update(categories).set(values).where(eq(categories.id, id)).returning();
    if (!row) return fail("That category no longer exists");
    revalidateBooks();
    return done("Category updated");
  }
  await db.insert(categories).values(values);
  revalidateBooks();
  return done(`“${name}” added`);
}

export async function toggleArchiveCategory(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing category");
  const [c] = await db.select().from(categories).where(eq(categories.id, id));
  if (!c) return fail("That category no longer exists");
  await db.update(categories).set({ archived: !c.archived }).where(eq(categories.id, id));
  revalidateBooks();
  return done(c.archived ? "Category restored" : "Category archived");
}

export async function deleteCategory(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing category");
  await db.delete(categories).where(eq(categories.id, id));
  revalidateBooks();
  return done("Category deleted — its entries are now uncategorised");
}
