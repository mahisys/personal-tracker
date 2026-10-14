import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { accounts, bills, categories } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { nextOccurrence } from "@/lib/recurrence";
import { logActivity } from "@/server/activity";
import { createTransaction } from "@/server/ledger";
import { shiftLatestDate } from "./bills";

/** A problem the user can fix; the message is shown as-is. */
export class PlannerError extends Error {}

type Bill = typeof bills.$inferSelect;

/**
 * For a recurring bill, inserts the next upcoming instance of its series (once). Monthly and yearly
 * series keep the day of month of the first bill, so a series on the 31st stays on month-ends.
 */
export async function createNextInstance(bill: Bill, conn: DbOrTx = db): Promise<Bill | null> {
  if (!bill.recurrence) return null;
  const seriesId = bill.seriesId ?? bill.id;
  let anchorDate = bill.dueDate;
  if (seriesId !== bill.id) {
    const [root] = await conn.select({ dueDate: bills.dueDate }).from(bills).where(eq(bills.id, seriesId));
    if (root) anchorDate = root.dueDate;
  }
  const next = nextOccurrence(bill.recurrence, bill.dueDate, Number(anchorDate.slice(8, 10)));
  if (!next) return null;
  if (!bill.seriesId) await conn.update(bills).set({ seriesId }).where(eq(bills.id, bill.id));
  const [already] = await conn
    .select()
    .from(bills)
    .where(and(eq(bills.seriesId, seriesId), eq(bills.dueDate, next), eq(bills.status, "upcoming")));
  if (already) return already;
  const [row] = await conn
    .insert(bills)
    .values({
      workspace: bill.workspace,
      title: bill.title,
      payee: bill.payee,
      kind: bill.kind,
      categoryId: bill.categoryId,
      accountId: bill.accountId,
      amountPaise: bill.amountPaise,
      dueDate: next,
      priority: bill.priority,
      canMove: bill.canMove,
      latestDate: shiftLatestDate(bill.dueDate, bill.latestDate, next),
      status: "upcoming",
      recurrence: bill.recurrence,
      seriesId,
      remindDaysBefore: bill.remindDaysBefore,
      notes: bill.notes,
    })
    .returning();
  await logActivity("bill", row.id, "created", `Next one scheduled for ${formatDay(next)}`, null, conn);
  return row;
}

export type MarkPaidInput = { billId: string; date: string; accountId: string; amountPaise: number; categoryId?: string | null };

/**
 * Pays a bill: records the expense (through createTransaction), marks the bill paid, and for a
 * recurring bill schedules the next one — all in one database transaction.
 */
export async function markBillPaid(input: MarkPaidInput) {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw new PlannerError("Enter the amount you paid");
  return db.transaction(async (tx) => {
    const [bill] = await tx.select().from(bills).where(eq(bills.id, input.billId)).for("update");
    if (!bill) throw new PlannerError("That bill no longer exists");
    if (bill.status !== "upcoming") throw new PlannerError(bill.status === "paid" ? "This bill is already paid" : "This bill was skipped");
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, input.accountId));
    if (!account) throw new PlannerError("Pick the account you paid from");
    let categoryId = input.categoryId ?? bill.categoryId;
    if (categoryId) {
      const [c] = await tx.select().from(categories).where(eq(categories.id, categoryId));
      if (!c || c.kind !== "expense") categoryId = null;
    }
    const txn = await createTransaction(
      {
        workspace: bill.workspace,
        type: "expense",
        date: input.date,
        accountId: account.id,
        amountPaise: input.amountPaise,
        categoryId,
        party: bill.payee,
        description: bill.title,
        billId: bill.id,
      },
      tx,
    );
    const [paid] = await tx
      .update(bills)
      .set({ status: "paid", paidDate: input.date, paidTransactionId: txn.id, accountId: bill.accountId ?? account.id })
      .where(eq(bills.id, bill.id))
      .returning();
    await logActivity("bill", bill.id, "paid", `Paid ${formatINR(input.amountPaise)} from ${account.name}`, { transactionId: txn.id }, tx);
    const next = await createNextInstance(paid, tx);
    return { bill: paid, transaction: txn, next, early: input.date < bill.dueDate };
  });
}

/** Skips this occurrence; a recurring bill moves on to its next instance. */
export async function skipBill(billId: string) {
  return db.transaction(async (tx) => {
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId)).for("update");
    if (!bill) throw new PlannerError("That bill no longer exists");
    if (bill.status !== "upcoming") throw new PlannerError("Only upcoming bills can be skipped");
    const [skipped] = await tx.update(bills).set({ status: "skipped" }).where(eq(bills.id, billId)).returning();
    await logActivity("bill", billId, "skipped", `Skipped the ${formatDay(bill.dueDate)} payment`, null, tx);
    const next = await createNextInstance(skipped, tx);
    return { bill: skipped, next };
  });
}

/** Moves an upcoming bill to a new date, never past its latest safe date. */
export async function moveBill(billId: string, toDate: string, conn: DbOrTx = db) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new PlannerError("Pick a new date");
  const [bill] = await conn.select().from(bills).where(eq(bills.id, billId));
  if (!bill) throw new PlannerError("That bill no longer exists");
  if (bill.status !== "upcoming") throw new PlannerError("Only upcoming bills can be moved");
  if (!bill.canMove) throw new PlannerError("This payment is marked as fixed — edit it to allow moving");
  if (bill.latestDate && toDate > bill.latestDate) throw new PlannerError(`This can only move until ${formatDay(bill.latestDate)}`);
  if (toDate === bill.dueDate) return bill;
  const [row] = await conn.update(bills).set({ dueDate: toDate }).where(eq(bills.id, billId)).returning();
  await logActivity("bill", billId, "moved", `Moved from ${formatDay(bill.dueDate)} to ${formatDay(toDate)}`, null, conn);
  return row;
}
