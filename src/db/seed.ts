/**
 * Idempotent seed: workspaces, default categories, CRM pipeline stages and a cash account.
 * Runs at container start after migrations (scripts/migrate.mjs) and via `npm run db:seed`.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const EXPENSE = [
  ["Rent", ["rent"]], ["Salaries", ["salary", "payroll"]], ["Software & subscriptions", ["google", "aws", "microsoft", "zoho", "subscription", "notion", "github"]],
  ["Travel", ["uber", "ola", "irctc", "makemytrip", "rapido", "indigo", "fuel", "petrol"]], ["Marketing", ["ads", "facebook", "meta", "linkedin"]],
  ["Office & supplies", ["amazon", "flipkart", "stationery"]], ["Utilities", ["electricity", "bescom", "msedcl", "water", "broadband", "airtel", "jio"]],
  ["Food & dining", ["swiggy", "zomato", "restaurant", "cafe"]], ["Groceries", ["bigbasket", "blinkit", "zepto", "dmart", "grocery"]],
  ["EMI & loan repayment", ["emi", "loan"]], ["Insurance", ["insurance", "lic", "premium"]], ["Credit card payment", ["credit card", "cc payment"]],
  ["Taxes & GST", ["gst", "tds", "income tax", "advance tax"]], ["Professional fees", ["ca fees", "consultant", "legal"]],
  ["Bank charges", ["charges", "fee"]], ["Health", ["pharmacy", "hospital", "apollo", "medical"]], ["Education", ["school", "fees", "course"]],
  ["Household", ["maid", "maintenance", "society"]], ["Sub-connector payouts", ["sub connector", "referral"]], ["Other expense", []],
] as const;
const INCOME = [
  ["Sales / services", ["invoice", "neft cr", "imps cr"]], ["DSA commission", ["payout", "commission"]], ["Salary", ["salary"]],
  ["Interest", ["interest", "int.pd"]], ["Refunds", ["refund", "reversal"]], ["Other income", []],
] as const;

const STAGES = [
  ["New", "open", 10], ["Contacted", "open", 20], ["Qualified", "open", 35], ["Proposal sent", "open", 55],
  ["Negotiation", "open", 75], ["Won", "won", 100], ["Lost", "lost", 0],
] as const;

export async function seed(db: Db) {
  await db
    .insert(schema.workspaces)
    .values([
      { key: "personal", name: "Personal", color: "#10b981", sort: 0 },
      { key: "mahisys", name: "MahiSys", color: "#6366f1", sort: 1 },
      { key: "dsa", name: "Loan DSA", color: "#f59e0b", sort: 2 },
    ])
    .onConflictDoNothing();

  const [{ n: catCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.categories);
  if (catCount === 0) {
    await db.insert(schema.categories).values([
      ...EXPENSE.map(([name, kw]) => ({ name, kind: "expense" as const, matchKeywords: [...kw] })),
      ...INCOME.map(([name, kw]) => ({ name, kind: "income" as const, matchKeywords: [...kw] })),
    ]);
  }

  const [{ n: stageCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.leadStages);
  if (stageCount === 0) {
    await db.insert(schema.leadStages).values(STAGES.map(([name, kind, probability], i) => ({ workspace: "mahisys" as const, name, kind, probability, sort: i })));
  }

  const [{ n: acctCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.accounts);
  if (acctCount === 0) {
    await db.insert(schema.accounts).values({ name: "Cash in hand", type: "cash", openingBalancePaise: 0, openingDate: new Date().toISOString().slice(0, 10) });
  }
}
