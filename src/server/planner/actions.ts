"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { BILL_KINDS, BILL_PRIORITIES, bills, categories, renewals, type BillKind, type BillPriority } from "@/db/schema";
import { bool, day, done, fail, str, type ActionResult } from "@/lib/action";
import { formatDay, todayIST } from "@/lib/dates";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { recurrenceFromForm } from "@/lib/recurrence";
import { logActivity } from "@/server/activity";
import { requireUser } from "@/server/auth";
import { parseWorkspace } from "@/server/workspace";
import { parseRemindDays } from "./bills";
import { PlannerError, markBillPaid, moveBill, skipBill } from "./service";

function revalidatePlanner(extra: string[] = []) {
  for (const p of ["/planner", "/planner/renewals", "/books", "/books/transactions", "/", ...extra]) revalidatePath(p);
}

function failFrom(e: unknown): ActionResult {
  if (e instanceof PlannerError) return fail(e.message);
  throw e;
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export async function saveBill(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const title = str(form, "title");
  if (!title) return fail("What is this payment for?");
  const amountPaise = parseRupeesToPaise(str(form, "amount"));
  if (amountPaise == null || amountPaise <= 0) return fail("Enter an amount greater than zero");
  const dueDate = day(form, "dueDate");
  if (!dueDate) return fail("Pick a due date");
  const kind = (str(form, "kind") ?? "bill") as BillKind;
  if (!BILL_KINDS.includes(kind)) return fail("Pick a kind");
  const priority = (str(form, "priority") ?? "important") as BillPriority;
  if (!BILL_PRIORITIES.includes(priority)) return fail("Pick a priority");
  const canMove = bool(form, "canMove");
  const latestDate = canMove ? day(form, "latestDate") : null;
  if (canMove && !latestDate) return fail("Until when can this payment safely wait?");
  if (latestDate && latestDate < dueDate) return fail("The latest date should be on or after the due date");
  let categoryId = str(form, "categoryId");
  if (categoryId) {
    const [c] = await db.select().from(categories).where(eq(categories.id, categoryId));
    if (!c || c.kind !== "expense") categoryId = null;
  }
  const remindRaw = str(form, "remindDaysBefore");
  const remindDaysBefore = remindRaw == null ? [] : parseRemindDays(remindRaw);
  const recurrence = recurrenceFromForm(form);
  if (recurrence?.until && recurrence.until < dueDate) return fail("“Until” should be after the due date");
  const values = {
    workspace: parseWorkspace(form.get("workspace"), "personal"),
    title,
    payee: str(form, "payee"),
    kind,
    categoryId,
    accountId: str(form, "accountId"),
    amountPaise,
    dueDate,
    priority,
    canMove,
    latestDate,
    recurrence,
    remindDaysBefore,
    notes: str(form, "notes") ?? "",
  };
  if (id) {
    const [before] = await db.select().from(bills).where(eq(bills.id, id));
    if (!before) return fail("That bill no longer exists");
    await db.update(bills).set(values).where(eq(bills.id, id));
    const changes: string[] = [];
    if (before.amountPaise !== amountPaise) changes.push(`amount ${formatINR(before.amountPaise)} → ${formatINR(amountPaise)}`);
    if (before.dueDate !== dueDate) changes.push(`due ${formatDay(before.dueDate)} → ${formatDay(dueDate)}`);
    if (before.priority !== priority) changes.push("priority");
    await logActivity("bill", id, "updated", changes.length ? `Edited: ${changes.join(", ")}` : "Details edited");
    revalidatePlanner([`/planner/bills/${id}`]);
    return done("Saved");
  }
  const [row] = await db.insert(bills).values(values).returning();
  await logActivity("bill", row.id, "created", `Added — ${formatINR(amountPaise)} due ${formatDay(dueDate)}`);
  revalidatePlanner();
  return done(`“${title}” is on the planner`);
}

export async function deleteBill(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing bill");
  const [b] = await db.delete(bills).where(eq(bills.id, id)).returning();
  if (!b) return fail("That bill is already gone");
  revalidatePlanner();
  return done("Bill removed", { redirectTo: str(form, "redirect") ?? undefined });
}

export async function payBill(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const billId = str(form, "id");
  if (!billId) return fail("Missing bill");
  const date = day(form, "date") ?? todayIST();
  const accountId = str(form, "accountId");
  if (!accountId) return fail("Pick the account you paid from");
  const amountPaise = parseRupeesToPaise(str(form, "amount"));
  if (amountPaise == null || amountPaise <= 0) return fail("Enter the amount you paid");
  try {
    const res = await markBillPaid({ billId, date, accountId, amountPaise, categoryId: str(form, "categoryId") });
    revalidatePlanner([`/planner/bills/${billId}`, `/books/accounts/${accountId}`]);
    const nextNote = res.next ? ` Next one ${formatDay(res.next.dueDate)}.` : "";
    return done(res.early ? `Paid early — nicely done!${nextNote}` : `Paid ✓ ${res.bill.title}.${nextNote}`, { celebrate: true });
  } catch (e) {
    return failFrom(e);
  }
}

export async function skipBillAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing bill");
  try {
    const res = await skipBill(id);
    revalidatePlanner([`/planner/bills/${id}`]);
    return done(res.next ? `Skipped — next one ${formatDay(res.next.dueDate)}` : "Skipped");
  } catch (e) {
    return failFrom(e);
  }
}

export async function moveBillAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const to = day(form, "toDate");
  if (!id) return fail("Missing bill");
  if (!to) return fail("Pick a new date");
  try {
    const row = await moveBill(id, to);
    revalidatePlanner([`/planner/bills/${id}`]);
    return done(`Moved to ${formatDay(row.dueDate)}`);
  } catch (e) {
    return failFrom(e);
  }
}

/** Applies one or more forecast suggestions ("ids" and "dates" are parallel lists). */
export async function applySuggestions(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const ids = form.getAll("billId").map(String);
  const dates = form.getAll("toDate").map(String);
  if (ids.length === 0 || ids.length !== dates.length) return fail("Nothing to apply");
  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) await moveBill(ids[i], dates[i], tx);
    });
  } catch (e) {
    return failFrom(e);
  }
  revalidatePlanner(ids.map((id) => `/planner/bills/${id}`));
  return done(ids.length === 1 ? "Moved — your cash cushion looks better" : `${ids.length} payments moved — cushion restored`);
}

// ---------------------------------------------------------------------------
// Renewals
// ---------------------------------------------------------------------------

export async function saveRenewal(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return fail("What needs renewing?");
  const expiresOn = day(form, "expiresOn");
  if (!expiresOn) return fail("Pick the expiry date");
  const remind = Number(str(form, "remindDaysBefore") ?? 30);
  if (!Number.isInteger(remind) || remind < 0 || remind > 365) return fail("Remind me should be 0–365 days");
  const values = {
    workspace: parseWorkspace(form.get("workspace"), "personal"),
    name,
    kind: str(form, "kind"),
    number: str(form, "number"),
    expiresOn,
    remindDaysBefore: remind,
    notes: str(form, "notes") ?? "",
  };
  if (id) {
    const [row] = await db.update(renewals).set(values).where(eq(renewals.id, id)).returning();
    if (!row) return fail("That item no longer exists");
    await logActivity("renewal", id, "updated", "Details edited");
    revalidatePlanner();
    return done("Saved");
  }
  const [row] = await db.insert(renewals).values(values).returning();
  await logActivity("renewal", row.id, "created", `Tracking expiry on ${formatDay(expiresOn)}`);
  revalidatePlanner();
  return done(`We'll remind you before ${name} expires`);
}

export async function markRenewed(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const expiresOn = day(form, "expiresOn");
  if (!id) return fail("Missing item");
  if (!expiresOn) return fail("Pick the new expiry date");
  const [before] = await db.select().from(renewals).where(eq(renewals.id, id));
  if (!before) return fail("That item no longer exists");
  if (expiresOn <= before.expiresOn) return fail("The new expiry should be after the old one");
  const number = str(form, "number");
  await db
    .update(renewals)
    .set({ expiresOn, renewedAt: new Date(), ...(number ? { number } : {}) })
    .where(eq(renewals.id, id));
  await logActivity("renewal", id, "renewed", `Renewed — valid until ${formatDay(expiresOn)}`);
  revalidatePlanner();
  return done(`Renewed — sorted until ${formatDay(expiresOn)}`, { celebrate: true });
}

export async function deleteRenewal(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing item");
  await db.delete(renewals).where(eq(renewals.id, id));
  revalidatePlanner();
  return done("Removed");
}
