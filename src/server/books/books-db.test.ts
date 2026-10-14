import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { resetDb } from "@/test/db";
import { createTransaction, getAccountBalances, liquidBalance } from "@/server/ledger";
import { buildStatement } from "./calc";
import { buildImportPreview, importStatementLines } from "./import-service";
import { commitImport, previewStatement } from "./import-actions";
import { deleteTransaction, saveAccount, saveTransaction } from "./actions";
import { parseCsv, guessMapping } from "./import";
import { getAccountTxnCounts, getAccountsWithBalances, getCategoryTotals, getMonthlyTotals, getTotals, getTransactionTotals, listAccountOptions, listTransactions } from "./queries";

async function account(name: string, type: "bank" | "cash" | "credit_card" | "loan" | "upi" | "wallet", opening = 0, ws: "personal" | "mahisys" | "dsa" | null = null) {
  const [a] = await db.insert(accounts).values({ name, type, openingBalancePaise: opening, openingDate: "2026-01-01", workspace: ws }).returning();
  return a;
}

function form(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe("account balances", () => {
  beforeEach(resetDb);

  it("adds income, subtracts expenses and moves transfers between accounts", async () => {
    const bank = await account("HDFC", "bank", 100_000_00);
    const cash = await account("Wallet cash", "cash", 2_000_00);
    const card = await account("Amex", "credit_card", 0);
    await createTransaction({ workspace: "personal", type: "income", date: "2026-10-01", accountId: bank.id, amountPaise: 50_000_00 });
    await createTransaction({ workspace: "personal", type: "expense", date: "2026-10-02", accountId: bank.id, amountPaise: 10_000_00 });
    await createTransaction({ workspace: "personal", type: "transfer", date: "2026-10-03", accountId: bank.id, transferAccountId: cash.id, amountPaise: 5_000_00 });
    await createTransaction({ workspace: "personal", type: "expense", date: "2026-10-04", accountId: card.id, amountPaise: 3_000_00 });
    await createTransaction({ workspace: "personal", type: "transfer", date: "2026-10-05", accountId: bank.id, transferAccountId: card.id, amountPaise: 3_000_00 });

    const bal = new Map((await getAccountBalances()).map((b) => [b.id, b.balancePaise]));
    expect(bal.get(bank.id)).toBe(100_000_00 + 50_000_00 - 10_000_00 - 5_000_00 - 3_000_00);
    expect(bal.get(cash.id)).toBe(7_000_00);
    expect(bal.get(card.id)).toBe(0);

    const asOf = new Map((await getAccountBalances("2026-10-03")).map((b) => [b.id, b.balancePaise]));
    expect(asOf.get(bank.id)).toBe(135_000_00);
    expect(asOf.get(card.id)).toBe(0);

    expect(liquidBalance(await getAccountBalances())).toBe(132_000_00 + 7_000_00);

    // The statement's running balance agrees with getAccountBalances.
    const rows = await db.select().from(transactions);
    const st = buildStatement(bank, rows);
    expect(st.at(-1)!.balancePaise).toBe(bal.get(bank.id));
    expect(st.map((r) => r.effectPaise)).toEqual([50_000_00, -10_000_00, -5_000_00, -3_000_00]);
    expect(buildStatement(cash, rows).map((r) => r.effectPaise)).toEqual([5_000_00]);
  });

  it("saveTransaction validates, creates transfers and edits keep invariants", async () => {
    const bank = await account("SBI", "bank", 10_000_00);
    const cash = (await db.select().from(accounts).where(eq(accounts.type, "cash")))[0];
    const [food] = await db.select().from(categories).where(eq(categories.name, "Food & dining"));
    const [salary] = await db.select().from(categories).where(eq(categories.name, "Salary"));

    expect(await saveTransaction(undefined, form({ type: "expense", date: "2026-10-01", accountId: bank.id, amount: "0", workspace: "personal" }))).toMatchObject({ ok: false });
    expect(await saveTransaction(undefined, form({ type: "transfer", date: "2026-10-01", accountId: bank.id, transferAccountId: bank.id, amount: "10", workspace: "personal" }))).toMatchObject({ ok: false });
    expect(await saveTransaction(undefined, form({ type: "expense", date: "2026-10-01", accountId: bank.id, amount: "10", categoryId: salary.id, workspace: "personal" }))).toMatchObject({ ok: false });

    const ok = await saveTransaction(undefined, form({ type: "expense", date: "2026-10-01", accountId: bank.id, amount: "1,180", gst: "180", categoryId: food.id, party: "Cafe", workspace: "mahisys" }));
    expect(ok).toMatchObject({ ok: true });
    const t = (await db.select().from(transactions))[0];
    expect(t).toMatchObject({ amountPaise: 118_000, gstPaise: 18_000, workspace: "mahisys", categoryId: food.id });

    // Change it into a transfer: the transfer account is stored and the category cleared.
    expect(await saveTransaction(undefined, form({ id: t.id, type: "transfer", date: "2026-10-01", accountId: bank.id, transferAccountId: cash.id, amount: "500", categoryId: food.id, workspace: "mahisys" }))).toMatchObject({ ok: true });
    const [t2] = await db.select().from(transactions).where(eq(transactions.id, t.id));
    expect(t2).toMatchObject({ type: "transfer", transferAccountId: cash.id, categoryId: null, amountPaise: 50_000 });

    // And back to an expense: the transfer account is cleared.
    await saveTransaction(undefined, form({ id: t.id, type: "expense", date: "2026-10-01", accountId: bank.id, transferAccountId: cash.id, amount: "500", workspace: "mahisys" }));
    const [t3] = await db.select().from(transactions).where(eq(transactions.id, t.id));
    expect(t3.transferAccountId).toBeNull();

    expect(await deleteTransaction(undefined, form({ id: t.id }))).toMatchObject({ ok: true });
    expect(await db.select().from(transactions)).toHaveLength(0);
  });

  it("stores what you owe on a card as a negative opening balance", async () => {
    expect(await saveAccount(undefined, form({ name: "ICICI Amazon", type: "credit_card", openingBalance: "12,500", owed: "on", creditLimit: "2,00,000", openingDate: "2026-10-01" }))).toMatchObject({ ok: true });
    const [card] = await db.select().from(accounts).where(eq(accounts.name, "ICICI Amazon"));
    expect(card).toMatchObject({ openingBalancePaise: -1_250_000, creditLimitPaise: 20_000_000, workspace: null });
  });
});

describe("bank statement import", () => {
  beforeEach(resetDb);

  const CSV = [
    "Statement for A/c XXXX1234",
    "Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance",
    "01/10/2026,UPI-SWIGGY-ORDER,111,450.00,,99550.00",
    "02/10/2026,NEFT CR-ACME SOLUTIONS,222,,\"25,000.00\",124550.00",
    "03/10/2026,SMS CHARGES,333,10.00,,124540.00",
    "03/10/2026,SMS CHARGES,333,10.00,,124530.00",
    "04/10/2026,MYSTERY,444,99.00,,124431.00",
  ].join("\n");

  it("previews with suggested categories, imports, and dedupes on re-import", async () => {
    const bank = await account("HDFC", "bank", 0, "mahisys");
    const { headers, rows } = parseCsv(CSV);
    const mapping = guessMapping(headers, rows);
    expect(mapping).toMatchObject({ date: 0, description: 1, amountMode: "split", debit: 3, credit: 4 });

    const preview = await buildImportPreview(bank.id, rows, mapping, "personal");
    expect(preview).toHaveLength(5);
    const cats = new Map((await db.select().from(categories)).map((c) => [c.id, c.name]));
    expect(cats.get(preview[0].categoryId!)).toBe("Food & dining");
    expect(cats.get(preview[1].categoryId!)).toBe("Sales / services");
    expect(preview[4].categoryId).toBeNull();
    expect(preview.every((l) => l.workspace === "mahisys")).toBe(true);
    expect(preview.some((l) => l.duplicate)).toBe(false);
    expect(preview[2].hash).not.toBe(preview[3].hash);

    const lines = preview.map((l) => ({ hash: l.hash, date: l.date!, description: l.description, reference: l.reference, amountPaise: l.amountPaise, type: l.type, categoryId: l.categoryId, workspace: l.workspace }));
    // Import the first three only.
    const first = await importStatementLines(bank.id, lines.slice(0, 3));
    expect(first).toEqual({ imported: 3, existed: 0 });

    // Re-import everything: three already exist, two are new.
    const again = await commitImport({ accountId: bank.id, lines });
    expect(again).toMatchObject({ ok: true, imported: 2, existed: 3, message: "2 imported, 3 already existed" });

    const all = await db.select().from(transactions).where(eq(transactions.accountId, bank.id));
    expect(all).toHaveLength(5);
    expect(all.every((t) => t.importHash)).toBe(true);

    const bal = (await getAccountBalances()).find((b) => b.id === bank.id)!;
    expect(bal.balancePaise).toBe(25_000_00 - 450_00 - 10_00 - 10_00 - 99_00);

    // Preview now flags every line as already imported.
    const p2 = await previewStatement({ accountId: bank.id, rows, mapping, workspace: "personal" });
    expect(p2.ok && p2.lines.every((l) => l.duplicate)).toBe(true);
  });

  it("rejects a bad mapping", async () => {
    const bank = await account("HDFC", "bank");
    const { rows } = parseCsv(CSV);
    const res = await previewStatement({ accountId: bank.id, rows, mapping: { date: 0, description: 1, dateFormat: "DD/MM/YYYY", amountMode: "signed", amount: null }, workspace: "personal" });
    expect(res).toEqual({ ok: false, error: "Pick the amount column" });
  });
});

describe("overview queries", () => {
  beforeEach(resetDb);

  it("totals, monthly series, category spend and filtered lists respect the workspace", async () => {
    const bank = await account("HDFC", "bank", 0);
    const dsaBank = await account("DSA current", "bank", 0, "dsa");
    const [food] = await db.select().from(categories).where(eq(categories.name, "Food & dining"));
    await createTransaction({ workspace: "personal", type: "expense", date: "2026-10-02", accountId: bank.id, amountPaise: 500_00, categoryId: food.id, party: "Swiggy" });
    await createTransaction({ workspace: "mahisys", type: "income", date: "2026-10-05", accountId: bank.id, amountPaise: 9_000_00, party: "Acme" });
    await createTransaction({ workspace: "mahisys", type: "expense", date: "2026-09-10", accountId: bank.id, amountPaise: 1_000_00 });
    await createTransaction({ workspace: "personal", type: "transfer", date: "2026-10-06", accountId: bank.id, transferAccountId: dsaBank.id, amountPaise: 100_00 });

    expect(await getTotals(null, "2026-10-01", "2026-10-31")).toEqual({ incomePaise: 9_000_00, expensePaise: 500_00, netPaise: 8_500_00 });
    expect(await getTotals("personal", "2026-10-01", "2026-10-31")).toEqual({ incomePaise: 0, expensePaise: 500_00, netPaise: -500_00 });

    const monthly = await getMonthlyTotals(null, "2026-10-14", 3);
    expect(monthly).toEqual([
      { month: "2026-08", incomePaise: 0, expensePaise: 0 },
      { month: "2026-09", incomePaise: 0, expensePaise: 1_000_00 },
      { month: "2026-10", incomePaise: 9_000_00, expensePaise: 500_00 },
    ]);

    const cats = await getCategoryTotals(null, "2026-10-01", "2026-10-31");
    expect(cats).toEqual([{ categoryId: food.id, name: "Food & dining", totalPaise: 500_00 }]);

    expect((await listTransactions({ q: "swig" })).map((t) => t.party)).toEqual(["Swiggy"]);
    expect(await listTransactions({ accountId: dsaBank.id })).toHaveLength(1);
    expect(await listTransactions({ categoryId: "none", type: "expense" })).toHaveLength(1);
    const rows = await listTransactions({ from: "2026-10-01", to: "2026-10-31" });
    expect(rows.map((r) => r.date)).toEqual(["2026-10-06", "2026-10-05", "2026-10-02"]);
    expect(rows[0]).toMatchObject({ accountName: "HDFC", toAccountName: "DSA current" });
    expect(await getTransactionTotals({ from: "2026-10-01" })).toMatchObject({ count: 3, incomePaise: 9_000_00, expensePaise: 500_00, transferPaise: 100_00 });

    expect((await getAccountsWithBalances("personal")).map((a) => a.name).sort()).toEqual(["Cash in hand", "HDFC"]);
    expect((await listAccountOptions("dsa")).map((a) => a.name).sort()).toEqual(["Cash in hand", "DSA current", "HDFC"]);
    expect((await getAccountTxnCounts([dsaBank.id])).get(dsaBank.id)).toBe(1);
  });
});
