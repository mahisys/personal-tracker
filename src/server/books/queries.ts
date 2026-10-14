import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { accounts, bills, categories, invoices, payouts, transactions, type TransactionType, type WorkspaceKey } from "@/db/schema";
import { getAccountBalances } from "@/server/ledger";
import { lastMonths, monthRange } from "./calc";

/** Accounts visible in a workspace: shared ones (no workspace) plus that workspace's own. */
export function accountWsCond(ws: WorkspaceKey | null): SQL | undefined {
  return ws ? or(isNull(accounts.workspace), eq(accounts.workspace, ws)) : undefined;
}

export type AccountWithBalance = Awaited<ReturnType<typeof getAccountBalances>>[number];

export async function getAccountsWithBalances(ws: WorkspaceKey | null, opts: { includeArchived?: boolean; asOf?: string } = {}): Promise<AccountWithBalance[]> {
  const all = await getAccountBalances(opts.asOf);
  return all
    .filter((a) => (opts.includeArchived ? true : !a.archived))
    .filter((a) => !ws || a.workspace == null || a.workspace === ws)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
}

/** Active accounts for pickers. */
export async function listAccountOptions(ws: WorkspaceKey | null = null) {
  return db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type, workspace: accounts.workspace, last4: accounts.last4 })
    .from(accounts)
    .where(and(eq(accounts.archived, false), accountWsCond(ws)))
    .orderBy(asc(accounts.name));
}

export async function listCategories(opts: { includeArchived?: boolean } = {}) {
  return db
    .select()
    .from(categories)
    .where(opts.includeArchived ? undefined : eq(categories.archived, false))
    .orderBy(asc(categories.kind), asc(categories.name));
}

export type CategoryRow = Awaited<ReturnType<typeof listCategories>>[number];

function wsTxnCond(ws: WorkspaceKey | null) {
  return ws ? eq(transactions.workspace, ws) : undefined;
}

/** Income and expense totals (transfers excluded) between two days, inclusive. */
export async function getTotals(ws: WorkspaceKey | null, from: string, to: string) {
  const [row] = await db
    .select({
      income: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountPaise} end), 0)`,
      expense: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountPaise} end), 0)`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to), wsTxnCond(ws)));
  const incomePaise = Number(row?.income ?? 0);
  const expensePaise = Number(row?.expense ?? 0);
  return { incomePaise, expensePaise, netPaise: incomePaise - expensePaise };
}

/** Income/expense per month for the last `n` months, oldest first. */
export async function getMonthlyTotals(ws: WorkspaceKey | null, today: string, n = 6) {
  const keys = lastMonths(today, n);
  const from = monthRange(keys[0]).from;
  const to = monthRange(keys[keys.length - 1]).to;
  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
      income: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountPaise} end), 0)`,
      expense: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountPaise} end), 0)`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to), wsTxnCond(ws)))
    .groupBy(sql`1`);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((k) => ({ month: k, incomePaise: Number(byMonth.get(k)?.income ?? 0), expensePaise: Number(byMonth.get(k)?.expense ?? 0) }));
}

/** Spend (or income) per category between two days, largest first. Uncategorised rows have a null id. */
export async function getCategoryTotals(ws: WorkspaceKey | null, from: string, to: string, kind: "income" | "expense" = "expense") {
  const rows = await db
    .select({ categoryId: transactions.categoryId, name: categories.name, total: sql<string>`sum(${transactions.amountPaise})` })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.type, kind), gte(transactions.date, from), lte(transactions.date, to), wsTxnCond(ws)))
    .groupBy(transactions.categoryId, categories.name);
  return rows
    .map((r) => ({ categoryId: r.categoryId, name: r.name ?? "Uncategorised", totalPaise: Number(r.total) }))
    .sort((a, b) => b.totalPaise - a.totalPaise);
}

export type TxnFilters = {
  from?: string | null;
  to?: string | null;
  ws?: WorkspaceKey | null;
  accountId?: string | null;
  categoryId?: string | null;
  type?: TransactionType | null;
  q?: string | null;
  billId?: string | null;
};

function txnWhere(f: TxnFilters) {
  const q = f.q?.trim();
  return and(
    f.from ? gte(transactions.date, f.from) : undefined,
    f.to ? lte(transactions.date, f.to) : undefined,
    f.ws ? eq(transactions.workspace, f.ws) : undefined,
    f.accountId ? or(eq(transactions.accountId, f.accountId), eq(transactions.transferAccountId, f.accountId)) : undefined,
    f.categoryId === "none" ? isNull(transactions.categoryId) : f.categoryId ? eq(transactions.categoryId, f.categoryId) : undefined,
    f.type ? eq(transactions.type, f.type) : undefined,
    f.billId ? eq(transactions.billId, f.billId) : undefined,
    q
      ? or(ilike(transactions.party, `%${q}%`), ilike(transactions.description, `%${q}%`), ilike(transactions.reference, `%${q}%`))
      : undefined,
  );
}

const toAccount = alias(accounts, "to_account");

export async function listTransactions(f: TxnFilters, limit = 400) {
  return db
    .select({
      id: transactions.id,
      workspace: transactions.workspace,
      type: transactions.type,
      date: transactions.date,
      accountId: transactions.accountId,
      transferAccountId: transactions.transferAccountId,
      amountPaise: transactions.amountPaise,
      categoryId: transactions.categoryId,
      party: transactions.party,
      description: transactions.description,
      gstPaise: transactions.gstPaise,
      tdsPaise: transactions.tdsPaise,
      reference: transactions.reference,
      invoiceId: transactions.invoiceId,
      billId: transactions.billId,
      payoutId: transactions.payoutId,
      importHash: transactions.importHash,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      accountName: accounts.name,
      accountType: accounts.type,
      toAccountName: toAccount.name,
      invoiceNumber: invoices.number,
      billTitle: bills.title,
      payoutLoanFileId: payouts.loanFileId,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(toAccount, eq(toAccount.id, transactions.transferAccountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .leftJoin(bills, eq(bills.id, transactions.billId))
    .leftJoin(payouts, eq(payouts.id, transactions.payoutId))
    .where(txnWhere(f))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);
}

export type TxnRow = Awaited<ReturnType<typeof listTransactions>>[number];

export async function getTransactionTotals(f: TxnFilters) {
  const [row] = await db
    .select({
      n: sql<number>`count(*)::int`,
      income: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountPaise} end), 0)`,
      expense: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountPaise} end), 0)`,
      transfer: sql<string>`coalesce(sum(case when ${transactions.type} = 'transfer' then ${transactions.amountPaise} end), 0)`,
      gst: sql<string>`coalesce(sum(${transactions.gstPaise}), 0)`,
      tds: sql<string>`coalesce(sum(${transactions.tdsPaise}), 0)`,
    })
    .from(transactions)
    .where(txnWhere(f));
  return {
    count: row?.n ?? 0,
    incomePaise: Number(row?.income ?? 0),
    expensePaise: Number(row?.expense ?? 0),
    transferPaise: Number(row?.transfer ?? 0),
    gstPaise: Number(row?.gst ?? 0),
    tdsPaise: Number(row?.tds ?? 0),
  };
}

export async function getAccount(id: string) {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
  return row ?? null;
}

/** Transaction counts per account (to know which can be deleted). */
export async function getAccountTxnCounts(ids: string[]) {
  if (ids.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ id: transactions.accountId, to: transactions.transferAccountId })
    .from(transactions)
    .where(or(inArray(transactions.accountId, ids), inArray(transactions.transferAccountId, ids)));
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.id, (m.get(r.id) ?? 0) + 1);
    if (r.to) m.set(r.to, (m.get(r.to) ?? 0) + 1);
  }
  return m;
}
