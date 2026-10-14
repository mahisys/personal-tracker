import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  activities,
  activityLog,
  borrowers,
  categories,
  lenders,
  loanDocuments,
  loanFiles,
  loanStageHistory,
  payoutRates,
  payouts,
  settings,
  subConnectors,
  tasks,
  transactions,
} from "@/db/schema";
import { resetDb } from "@/test/db";
import { defaultChecklist } from "./constants";
import {
  addActivityAction,
  addFileTaskAction,
  createLoanFileAction,
  markInvoicedAction,
  markPartnerPaidAction,
  markReceivedAction,
  moveStageAction,
  setDocStatusAction,
  setPayoutRateAction,
  updatePendingAction,
} from "./actions";

function fd(values: Record<string, string | number | boolean | null | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) if (v != null) f.set(k, String(v));
  return f;
}

const lakh = (n: number) => n * 100_000 * 100;

async function setup() {
  const [lender] = await db.insert(lenders).values({ name: "HDFC Bank", type: "bank", payoutDays: 45 }).returning();
  await db.insert(payoutRates).values([
    { lenderId: lender.id, product: "home_loan", minTicketPaise: 0, maxTicketPaise: null, rateBps: 35 },
    { lenderId: lender.id, product: "home_loan", minTicketPaise: lakh(30), maxTicketPaise: lakh(75), rateBps: 50 },
  ]);
  const [partner] = await db.insert(subConnectors).values({ name: "Ravi (connector)", shareBps: 2500 }).returning();
  const [borrower] = await db
    .insert(borrowers)
    .values({ name: "Asha Patil", phone: "9876543210", employmentType: "salaried", subConnectorId: partner.id })
    .returning();
  const [cash] = await db.select().from(accounts);
  return { lender, partner, borrower, cash };
}

async function openFile(borrowerId: string, product = "home_loan", extra: Record<string, string> = {}) {
  const res = await createLoanFileAction(undefined, fd({ borrowerMode: "existing", borrowerId, product, amountRequested: "5000000", ...extra }));
  expect(res?.ok).toBe(true);
  const [file] = await db.select().from(loanFiles).orderBy(loanFiles.createdAt);
  return file;
}

async function move(fileId: string, stage: string, extra: Record<string, string | null> = {}) {
  return moveStageAction(undefined, fd({ fileId, stage, ...extra }));
}

describe("DSA desk (db)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates a file with the default checklist, history and borrower's partner", async () => {
    const { borrower, partner } = await setup();
    const file = await openFile(borrower.id);
    expect(file.stage).toBe("lead");
    expect(file.amountRequestedPaise).toBe(lakh(50));
    expect(file.subConnectorId).toBe(partner.id);
    const docs = await db.select().from(loanDocuments).where(eq(loanDocuments.loanFileId, file.id)).orderBy(loanDocuments.sort);
    expect(docs.map((d) => d.name)).toEqual(defaultChecklist("home_loan", "salaried"));
    expect(docs.every((d) => d.status === "pending")).toBe(true);
    const hist = await db.select().from(loanStageHistory).where(eq(loanStageHistory.loanFileId, file.id));
    expect(hist).toHaveLength(1);
    expect(hist[0].toStage).toBe("lead");
  });

  it("can create a borrower inline with the file", async () => {
    const res = await createLoanFileAction(
      undefined,
      fd({ borrowerMode: "new", b_name: "Imran Shaikh", b_phone: "9000000000", b_employmentType: "business", b_monthlyIncome: "150000", b_cibilScore: "760", product: "business_loan", amountRequested: "1500000" }),
    );
    expect(res?.ok).toBe(true);
    const [b] = await db.select().from(borrowers);
    expect(b).toMatchObject({ name: "Imran Shaikh", employmentType: "business", monthlyIncomePaise: 15_000_000, cibilScore: 760 });
    const docs = await db.select().from(loanDocuments);
    expect(docs.some((d) => d.name.startsWith("ITR"))).toBe(true);
  });

  it("rejects bad input politely", async () => {
    const { borrower } = await setup();
    expect((await createLoanFileAction(undefined, fd({ borrowerMode: "existing", borrowerId: borrower.id, product: "home_loan", amountRequested: "abc" })))?.error).toBeTruthy();
    expect((await createLoanFileAction(undefined, fd({ borrowerMode: "new", product: "home_loan", amountRequested: "100" })))?.error).toMatch(/name/);
    const file = await openFile(borrower.id);
    const r = await move(file.id, "logged_in", { loginDate: "2026-10-01" });
    expect(r?.error).toMatch(/lender/);
    const r2 = await move(file.id, "rejected");
    expect(r2?.error).toMatch(/reason/);
  });

  it("moves through stages and creates the payout on disbursal", async () => {
    const { borrower, lender, partner } = await setup();
    await db.insert(settings).values({ key: "finance", value: { commissionTdsBps: 200, commissionGstBps: 1800 } });
    const file = await openFile(borrower.id);

    expect((await move(file.id, "documents"))?.ok).toBe(true);
    expect((await move(file.id, "logged_in", { applicationNo: "HL-123", loginDate: "2026-10-01", lenderId: lender.id }))?.ok).toBe(true);
    const sanc = await move(file.id, "sanctioned", { sanctioned: "5000000", sanctionDate: "2026-10-08" });
    expect(sanc).toMatchObject({ ok: true, celebrate: true });
    const dis = await move(file.id, "disbursed", { disbursed: "4800000", disbursalDate: "2026-10-12" });
    expect(dis).toMatchObject({ ok: true, celebrate: true });

    const [f] = await db.select().from(loanFiles).where(eq(loanFiles.id, file.id));
    expect(f.stage).toBe("disbursed");
    expect(f.payoutRateBps).toBe(50); // ₹48L falls in the 30–75L slab
    expect(f.expectedPayoutPaise).toBe(2_400_000); // ₹24,000
    expect(f.pendingWith).toBe("lender");

    const [p] = await db.select().from(payouts).where(eq(payouts.loanFileId, file.id));
    expect(p).toMatchObject({
      status: "expected",
      lenderId: lender.id,
      expectedDate: "2026-11-26",
      grossPaise: 2_400_000,
      gstPaise: 432_000,
      tdsPaise: 48_000,
      subConnectorId: partner.id,
      subConnectorSharePaise: 600_000,
    });

    const hist = await db.select().from(loanStageHistory).where(eq(loanStageHistory.loanFileId, file.id));
    expect(hist.map((h) => h.toStage)).toEqual(["lead", "documents", "logged_in", "sanctioned", "disbursed"]);
    const log = await db.select().from(activityLog).where(eq(activityLog.entityId, file.id));
    expect(log.some((l) => l.summary.startsWith("Moved to Disbursed"))).toBe(true);
  });

  it("creates a zero payout when the grid has no rate, then fixes it inline", async () => {
    const { borrower, lender } = await setup();
    const file = await openFile(borrower.id, "car_loan");
    await move(file.id, "disbursed", { disbursed: "800000", disbursalDate: "2026-10-10", lenderId: lender.id });
    let [p] = await db.select().from(payouts);
    expect(p.grossPaise).toBe(0);
    const r = await setPayoutRateAction(undefined, fd({ fileId: file.id, rate: "1.5", saveToGrid: "on" }));
    expect(r?.ok).toBe(true);
    [p] = await db.select().from(payouts);
    expect(p.grossPaise).toBe(1_200_000); // 1.5% of ₹8L = ₹12,000
    expect(p.tdsPaise).toBe(24_000);
    expect(p.subConnectorSharePaise).toBe(300_000);
    const grid = await db.select().from(payoutRates).where(eq(payoutRates.product, "car_loan"));
    expect(grid).toHaveLength(1);
  });

  it("invoices and receives a payout into the books", async () => {
    const { borrower, lender, cash, partner } = await setup();
    const file = await openFile(borrower.id);
    await move(file.id, "disbursed", { disbursed: "2000000", disbursalDate: "2026-10-05", lenderId: lender.id });
    const [p] = await db.select().from(payouts);
    expect(p.grossPaise).toBe(700_000); // 0.35% of ₹20L = ₹7,000

    expect((await markInvoicedAction(undefined, fd({ payoutId: p.id, invoiceNo: "DSA/26/001" })))?.error).toMatch(/date/);
    expect((await markInvoicedAction(undefined, fd({ payoutId: p.id, invoiceNo: "DSA/26/001", invoiceDate: "2026-10-06" })))?.ok).toBe(true);
    let [f] = await db.select().from(loanFiles);
    expect(f.stage).toBe("payout_invoiced");

    const res = await markReceivedAction(undefined, fd({ payoutId: p.id, receivedDate: "2026-11-02", netReceived: "6860", accountId: cash.id }));
    expect(res).toMatchObject({ ok: true, celebrate: true });

    const [paid] = await db.select().from(payouts);
    expect(paid).toMatchObject({ status: "received", receivedDate: "2026-11-02", netReceivedPaise: 686_000 });
    const [txn] = await db.select().from(transactions).where(eq(transactions.payoutId, p.id));
    const [cat] = await db.select().from(categories).where(eq(categories.name, "DSA commission"));
    expect(txn).toMatchObject({ workspace: "dsa", type: "income", amountPaise: 686_000, tdsPaise: 14_000, party: "HDFC Bank", categoryId: cat.id, accountId: cash.id });
    expect(paid.transactionId).toBe(txn.id);
    [f] = await db.select().from(loanFiles);
    expect(f.stage).toBe("payout_received");

    // can't receive twice
    expect((await markReceivedAction(undefined, fd({ payoutId: p.id, receivedDate: "2026-11-02", accountId: cash.id })))?.error).toBeTruthy();

    // partner share
    const pay = await markPartnerPaidAction(undefined, fd({ payoutId: p.id, date: "2026-11-03", accountId: cash.id }));
    expect(pay?.ok).toBe(true);
    const out = await db.select().from(transactions).where(eq(transactions.type, "expense"));
    expect(out[0]).toMatchObject({ amountPaise: 175_000, party: partner.name });
    const [after] = await db.select().from(payouts);
    expect(after.subConnectorPaidDate).toBe("2026-11-03");
  });

  it("receiving straight from the board books the money too", async () => {
    const { borrower, lender, cash } = await setup();
    const file = await openFile(borrower.id);
    await move(file.id, "disbursed", { disbursed: "2000000", disbursalDate: "2026-10-05", lenderId: lender.id });
    const r = await move(file.id, "payout_received", { receivedDate: "2026-10-30", accountId: cash.id });
    expect(r).toMatchObject({ ok: true, celebrate: true });
    const [txn] = await db.select().from(transactions);
    expect(txn.amountPaise).toBe(700_000 - 14_000); // default 2% TDS, no GST
  });

  it("moving back before disbursal drops an expected payout but not an invoiced one", async () => {
    const { borrower, lender } = await setup();
    const file = await openFile(borrower.id);
    await move(file.id, "disbursed", { disbursed: "2000000", disbursalDate: "2026-10-05", lenderId: lender.id });
    expect((await move(file.id, "sanctioned", { sanctioned: "2000000", sanctionDate: "2026-10-01" }))?.ok).toBe(true);
    expect(await db.select().from(payouts)).toHaveLength(0);

    await move(file.id, "disbursed", { disbursed: "2000000", disbursalDate: "2026-10-05" });
    const [p] = await db.select().from(payouts);
    await markInvoicedAction(undefined, fd({ payoutId: p.id, invoiceNo: "X1", invoiceDate: "2026-10-06" }));
    expect((await move(file.id, "dropped", { closeReason: "x" }))?.error).toMatch(/invoiced/);
  });

  it("tracks pending-with, documents, activities and tasks", async () => {
    const { borrower } = await setup();
    const file = await openFile(borrower.id);
    expect((await updatePendingAction(undefined, fd({ fileId: file.id, pendingWith: "customer", pendingNote: "Bank statement" })))?.ok).toBe(true);
    const [f] = await db.select().from(loanFiles);
    expect(f).toMatchObject({ pendingWith: "customer", pendingNote: "Bank statement" });
    const log = await db.select().from(activityLog).where(eq(activityLog.action, "pending_changed"));
    expect(log).toHaveLength(1);

    const [doc] = await db.select().from(loanDocuments).where(eq(loanDocuments.loanFileId, file.id)).limit(1);
    await setDocStatusAction(undefined, fd({ id: doc.id }));
    let [d] = await db.select().from(loanDocuments).where(eq(loanDocuments.id, doc.id));
    expect(d.status).toBe("received");
    expect(d.receivedAt).toBeTruthy();
    await setDocStatusAction(undefined, fd({ id: doc.id, status: "not_needed" }));
    [d] = await db.select().from(loanDocuments).where(eq(loanDocuments.id, doc.id));
    expect(d.status).toBe("not_needed");

    await addActivityAction(undefined, fd({ loanFileId: file.id, type: "call", subject: "Asked for ITR" }));
    const [a] = await db.select().from(activities);
    expect(a).toMatchObject({ workspace: "dsa", loanFileId: file.id, borrowerId: borrower.id });

    await addFileTaskAction(undefined, fd({ fileId: file.id, title: "Collect cheque", dueDate: "2026-10-20" }));
    const [t] = await db.select().from(tasks);
    expect(t).toMatchObject({ workspace: "dsa", linkedType: "loan_file", linkedId: file.id, dueDate: "2026-10-20" });
  });
});
