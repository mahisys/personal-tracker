/** Pure book-keeping helpers: running balances, budgets, month ranges. */
import type { AccountType, TransactionType } from "@/db/schema";
import { addMonths, endOfMonth, monthKey, startOfMonth } from "@/lib/dates";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: "Bank",
  cash: "Cash",
  upi: "UPI",
  wallet: "Wallet",
  credit_card: "Credit card",
  loan: "Loan",
};

export const LIQUID_TYPES: AccountType[] = ["bank", "cash", "upi", "wallet"];

export type LedgerTxn = {
  id: string;
  type: TransactionType;
  date: string;
  accountId: string;
  transferAccountId: string | null;
  amountPaise: number;
  createdAt?: Date;
};

/** How a transaction moves one account's balance (positive = balance goes up). */
export function accountEffect(t: Pick<LedgerTxn, "type" | "accountId" | "transferAccountId" | "amountPaise">, accountId: string): number {
  if (t.type === "transfer") {
    if (t.accountId === accountId) return -t.amountPaise;
    if (t.transferAccountId === accountId) return t.amountPaise;
    return 0;
  }
  if (t.accountId !== accountId) return 0;
  return t.type === "income" ? t.amountPaise : -t.amountPaise;
}

export type StatementRow<T extends LedgerTxn> = T & { effectPaise: number; balancePaise: number };

/**
 * Statement with a running balance, oldest first. Matches getAccountBalances(): opening balance plus
 * every transaction touching the account.
 */
export function buildStatement<T extends LedgerTxn>(account: { id: string; openingBalancePaise: number }, txns: T[]): StatementRow<T>[] {
  const sorted = [...txns].sort((a, b) => (a.date === b.date ? (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) : a.date.localeCompare(b.date)));
  let bal = account.openingBalancePaise;
  const out: StatementRow<T>[] = [];
  for (const t of sorted) {
    const effect = accountEffect(t, account.id);
    if (effect === 0) continue;
    bal += effect;
    out.push({ ...t, effectPaise: effect, balancePaise: bal });
  }
  return out;
}

/** End-of-day balance points for a chart (one point per day that has activity, plus the opening). */
export function balanceSeries(opening: { date: string; balancePaise: number }, rows: { date: string; balancePaise: number }[]) {
  const points = new Map<string, number>();
  points.set(opening.date, opening.balancePaise);
  for (const r of rows) points.set(r.date, r.balancePaise);
  return [...points.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, balancePaise]) => ({ date, balancePaise }));
}

export type BudgetState = { pct: number; tone: "good" | "warn" | "bad"; leftPaise: number };

/** Budget usage: green under 80%, amber from 80% to 100%, rose over budget. */
export function budgetState(spentPaise: number, budgetPaise: number): BudgetState {
  const pct = budgetPaise > 0 ? Math.round((spentPaise / budgetPaise) * 100) : 0;
  const tone = pct > 100 ? "bad" : pct >= 80 ? "warn" : "good";
  return { pct, tone, leftPaise: budgetPaise - spentPaise };
}

/** The last `n` month keys ending with the month of `today`, oldest first. */
export function lastMonths(today: string, n: number): string[] {
  const start = startOfMonth(today);
  return Array.from({ length: n }, (_, i) => monthKey(addMonths(start, i - (n - 1))));
}

export function monthRange(key: string): { from: string; to: string } {
  const from = `${key}-01`;
  return { from, to: endOfMonth(from) };
}
