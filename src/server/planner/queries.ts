import "server-only";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bills, categories, renewals, transactions, type WorkspaceKey } from "@/db/schema";

const billSelect = {
  bill: bills,
  accountName: accounts.name,
  accountType: accounts.type,
  categoryName: categories.name,
};

export async function listUpcomingBills(ws: WorkspaceKey | null) {
  const rows = await db
    .select(billSelect)
    .from(bills)
    .leftJoin(accounts, eq(accounts.id, bills.accountId))
    .leftJoin(categories, eq(categories.id, bills.categoryId))
    .where(and(eq(bills.status, "upcoming"), ws ? eq(bills.workspace, ws) : undefined))
    .orderBy(asc(bills.dueDate), desc(bills.amountPaise));
  return rows.map((r) => ({ ...r.bill, accountName: r.accountName, accountType: r.accountType, categoryName: r.categoryName }));
}

export type UpcomingBill = Awaited<ReturnType<typeof listUpcomingBills>>[number];

export async function listRecentlyPaid(ws: WorkspaceKey | null, limit = 6) {
  const rows = await db
    .select(billSelect)
    .from(bills)
    .leftJoin(accounts, eq(accounts.id, bills.accountId))
    .leftJoin(categories, eq(categories.id, bills.categoryId))
    .where(and(eq(bills.status, "paid"), ws ? eq(bills.workspace, ws) : undefined))
    .orderBy(desc(bills.paidDate), desc(bills.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.bill, accountName: r.accountName, accountType: r.accountType, categoryName: r.categoryName }));
}

export async function getBill(id: string) {
  const [r] = await db
    .select(billSelect)
    .from(bills)
    .leftJoin(accounts, eq(accounts.id, bills.accountId))
    .leftJoin(categories, eq(categories.id, bills.categoryId))
    .where(eq(bills.id, id));
  return r ? { ...r.bill, accountName: r.accountName, accountType: r.accountType, categoryName: r.categoryName } : null;
}

/** Every instance of the bill's series (or just the bill), newest first, with the payment entry. */
export async function getSeries(bill: { id: string; seriesId: string | null }) {
  const sid = bill.seriesId ?? bill.id;
  const rows = await db
    .select()
    .from(bills)
    .where(or(eq(bills.seriesId, sid), eq(bills.id, sid), eq(bills.id, bill.id)))
    .orderBy(desc(bills.dueDate));
  const txnIds = rows.map((r) => r.paidTransactionId).filter((x): x is string => !!x);
  const txns = txnIds.length
    ? await db
        .select({ id: transactions.id, date: transactions.date, amountPaise: transactions.amountPaise, accountName: accounts.name })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .where(inArray(transactions.id, txnIds))
    : [];
  const byId = new Map(txns.map((t) => [t.id, t]));
  return rows.map((r) => ({ ...r, payment: r.paidTransactionId ? (byId.get(r.paidTransactionId) ?? null) : null }));
}

export async function listRenewals(ws: WorkspaceKey | null) {
  return db
    .select()
    .from(renewals)
    .where(ws ? eq(renewals.workspace, ws) : undefined)
    .orderBy(asc(renewals.expiresOn));
}

export type RenewalRow = Awaited<ReturnType<typeof listRenewals>>[number];
