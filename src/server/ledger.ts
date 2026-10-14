import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { accounts, transactions, type TransactionType, type WorkspaceKey } from "@/db/schema";
import { logActivity } from "./activity";

export type NewTransaction = {
  workspace: WorkspaceKey;
  type: TransactionType;
  date: string;
  accountId: string;
  transferAccountId?: string | null;
  amountPaise: number;
  categoryId?: string | null;
  party?: string | null;
  description?: string;
  gstPaise?: number;
  tdsPaise?: number;
  reference?: string | null;
  invoiceId?: string | null;
  billId?: string | null;
  payoutId?: string | null;
  importHash?: string | null;
  tags?: string[];
};

/**
 * The single way money enters the books. Invoices, bills, DSA payouts and manual entries all call this,
 * so balances and reports always agree.
 */
export async function createTransaction(t: NewTransaction, conn: DbOrTx = db) {
  if (!Number.isInteger(t.amountPaise) || t.amountPaise <= 0) throw new Error("Amount must be greater than zero");
  if (t.type === "transfer" && (!t.transferAccountId || t.transferAccountId === t.accountId)) {
    throw new Error("A transfer needs two different accounts");
  }
  const [row] = await conn
    .insert(transactions)
    .values({
      workspace: t.workspace,
      type: t.type,
      date: t.date,
      accountId: t.accountId,
      transferAccountId: t.type === "transfer" ? t.transferAccountId! : null,
      amountPaise: t.amountPaise,
      categoryId: t.categoryId ?? null,
      party: t.party ?? null,
      description: t.description ?? "",
      gstPaise: t.gstPaise ?? 0,
      tdsPaise: t.tdsPaise ?? 0,
      reference: t.reference ?? null,
      invoiceId: t.invoiceId ?? null,
      billId: t.billId ?? null,
      payoutId: t.payoutId ?? null,
      importHash: t.importHash ?? null,
      tags: t.tags ?? [],
    })
    .returning();
  await logActivity("transaction", row.id, "created", `${t.type} recorded`, null, conn);
  return row;
}

/**
 * Balance of every account as of a day (inclusive): opening + income − expense − transfers out + transfers in.
 * Returned in paise. For credit cards and loans a negative balance is the amount owed.
 */
export async function getAccountBalances(asOf?: string, conn: DbOrTx = db) {
  const dateCond = asOf ? lte(transactions.date, asOf) : undefined;
  const flows = await conn
    .select({
      accountId: transactions.accountId,
      net: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountPaise} else -${transactions.amountPaise} end), 0)`,
    })
    .from(transactions)
    .where(dateCond)
    .groupBy(transactions.accountId);
  const incoming = await conn
    .select({ accountId: transactions.transferAccountId, net: sql<string>`coalesce(sum(${transactions.amountPaise}), 0)` })
    .from(transactions)
    .where(and(eq(transactions.type, "transfer"), dateCond))
    .groupBy(transactions.transferAccountId);
  const accts = await conn.select().from(accounts);
  const byId = new Map<string, number>();
  for (const f of flows) byId.set(f.accountId, (byId.get(f.accountId) ?? 0) + Number(f.net));
  for (const f of incoming) if (f.accountId) byId.set(f.accountId, (byId.get(f.accountId) ?? 0) + Number(f.net));
  return accts.map((a) => ({
    ...a,
    balancePaise: (!asOf || a.openingDate <= asOf ? a.openingBalancePaise : 0) + (byId.get(a.id) ?? 0),
  }));
}

/** Money you can actually spend: bank + cash + UPI + wallet balances (credit cards and loans excluded). */
export function liquidBalance(balances: { type: string; archived: boolean; balancePaise: number }[]): number {
  return balances
    .filter((b) => !b.archived && ["bank", "cash", "upi", "wallet"].includes(b.type))
    .reduce((s, b) => s + b.balancePaise, 0);
}
