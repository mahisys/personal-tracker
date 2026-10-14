import "server-only";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bills, borrowers, invoices, lenders, loanFiles, payouts, type WorkspaceKey } from "@/db/schema";
import { todayIST } from "@/lib/dates";
import { getAccountBalances, liquidBalance } from "@/server/ledger";
import { getSettings } from "@/server/settings";
import { buildForecast, type CashForecast } from "./forecast-core";

export type { CashForecast, ForecastDay, ForecastItem, ForecastSuggestion } from "./forecast-core";
export { buildForecast } from "./forecast-core";

/**
 * Projected liquid balance for the next `days` days (default 90). Start = today's liquid balance
 * (bank, cash, UPI, wallet). Outflows = upcoming bills (and their future recurring occurrences);
 * inflows = open invoice balances and expected DSA payouts (gross + GST − TDS).
 */
export async function getCashForecast(opts: { days?: number; workspace?: WorkspaceKey | null; today?: string } = {}): Promise<CashForecast> {
  const today = opts.today ?? todayIST();
  const days = opts.days ?? 90;
  const ws = opts.workspace ?? null;

  const [balances, settings, billRows, invoiceRows, payoutRows] = await Promise.all([
    getAccountBalances(today),
    getSettings(),
    db
      .select()
      .from(bills)
      .where(and(eq(bills.status, "upcoming"), ws ? eq(bills.workspace, ws) : undefined)),
    db
      .select({ id: invoices.id, number: invoices.number, billTo: invoices.billTo, dueDate: invoices.dueDate, totalPaise: invoices.totalPaise, paidPaise: invoices.paidPaise })
      .from(invoices)
      .where(and(inArray(invoices.status, ["sent", "part_paid"]), ws ? eq(invoices.workspace, ws) : undefined)),
    !ws || ws === "dsa"
      ? db
          .select({
            id: payouts.id,
            expectedDate: payouts.expectedDate,
            grossPaise: payouts.grossPaise,
            gstPaise: payouts.gstPaise,
            tdsPaise: payouts.tdsPaise,
            borrower: borrowers.name,
            lender: lenders.name,
          })
          .from(payouts)
          .innerJoin(loanFiles, eq(loanFiles.id, payouts.loanFileId))
          .leftJoin(borrowers, eq(borrowers.id, loanFiles.borrowerId))
          .leftJoin(lenders, eq(lenders.id, payouts.lenderId))
          .where(inArray(payouts.status, ["expected", "invoiced"]))
      : Promise.resolve([]),
  ]);

  const wsAccounts = ws
    ? new Set((await db.select({ id: accounts.id }).from(accounts).where(or(isNull(accounts.workspace), eq(accounts.workspace, ws)))).map((a) => a.id))
    : null;
  const start = liquidBalance(wsAccounts ? balances.filter((b) => wsAccounts.has(b.id)) : balances);

  return buildForecast({
    today,
    days,
    startBalancePaise: start,
    minBalancePaise: settings.finance.minBalancePaise,
    bills: billRows.map((b) => ({
      id: b.id,
      title: b.title,
      amountPaise: b.amountPaise,
      dueDate: b.dueDate,
      priority: b.priority,
      canMove: b.canMove,
      latestDate: b.latestDate,
      recurrence: b.recurrence ?? null,
      seriesId: b.seriesId,
    })),
    invoices: invoiceRows.map((i) => ({
      id: i.id,
      label: `Invoice ${i.number}${i.billTo?.name ? ` · ${i.billTo.name}` : ""}`,
      balancePaise: i.totalPaise - i.paidPaise,
      dueDate: i.dueDate,
    })),
    payouts: payoutRows.map((p) => ({
      id: p.id,
      label: `Payout${p.lender ? ` · ${p.lender}` : ""}${p.borrower ? ` (${p.borrower})` : ""}`,
      amountPaise: p.grossPaise + p.gstPaise - p.tdsPaise,
      expectedDate: p.expectedDate,
    })),
  });
}
