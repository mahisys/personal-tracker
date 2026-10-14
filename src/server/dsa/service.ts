import "server-only";
import { and, asc, eq, ilike } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  borrowers,
  categories,
  lenders,
  loanDocuments,
  loanFiles,
  loanStageHistory,
  payoutRates,
  payouts,
  subConnectors,
  type LoanProduct,
  type LoanStage,
} from "@/db/schema";
import { createTransaction } from "@/server/ledger";
import { getSettings } from "@/server/settings";
import { logActivity } from "@/server/activity";
import { formatINR, bpsToPercent } from "@/lib/money";
import { STAGE_DEFAULT_PENDING, STAGE_LABELS, defaultChecklist, stageIndex, type EmploymentType } from "./constants";
import { computePayout, expectedPayoutDate, findPayoutRate, netOf, payoutBreakdown } from "./logic";

/** A validation problem worth showing to the user as-is. */
export class DsaError extends Error {}

export const ENTITY = "loan_file";

type LoanFile = typeof loanFiles.$inferSelect;
type Payout = typeof payouts.$inferSelect;

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export async function createLoanFile(
  input: {
    borrowerId: string;
    product: LoanProduct;
    amountRequestedPaise: number;
    lenderId?: string | null;
    subConnectorId?: string | null;
    notes?: string;
  },
  conn: DbOrTx = db,
) {
  const [b] = await conn.select().from(borrowers).where(eq(borrowers.id, input.borrowerId));
  if (!b) throw new DsaError("Borrower not found");
  const [file] = await conn
    .insert(loanFiles)
    .values({
      borrowerId: b.id,
      product: input.product,
      amountRequestedPaise: input.amountRequestedPaise,
      lenderId: input.lenderId ?? null,
      subConnectorId: input.subConnectorId ?? b.subConnectorId ?? null,
      stage: "lead",
      pendingWith: STAGE_DEFAULT_PENDING.lead,
      notes: input.notes ?? "",
    })
    .returning();
  await conn.insert(loanStageHistory).values({ loanFileId: file.id, fromStage: null, toStage: "lead", note: "File opened" });
  const docs = defaultChecklist(input.product, b.employmentType as EmploymentType | null);
  if (docs.length) await conn.insert(loanDocuments).values(docs.map((name, i) => ({ loanFileId: file.id, name, sort: i })));
  await logActivity(ENTITY, file.id, "created", `File opened for ${b.name} — ${formatINR(input.amountRequestedPaise, { whole: true })}`, null, conn);
  return file;
}

export type StageMoveInput = {
  note?: string | null;
  applicationNo?: string | null;
  loginDate?: string | null;
  lenderId?: string | null;
  sanctionedPaise?: number | null;
  sanctionDate?: string | null;
  disbursedPaise?: number | null;
  disbursalDate?: string | null;
  closeReason?: string | null;
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  receivedDate?: string | null;
  netReceivedPaise?: number | null;
  tdsPaise?: number | null;
  accountId?: string | null;
};

/** Writes the stage change itself: file row, history row and activity log. */
async function setStage(file: LoanFile, to: LoanStage, patch: Partial<typeof loanFiles.$inferInsert>, note: string, conn: DbOrTx) {
  await conn
    .update(loanFiles)
    .set({ ...patch, stage: to, stageChangedAt: new Date(), pendingWith: STAGE_DEFAULT_PENDING[to], pendingNote: "" })
    .where(eq(loanFiles.id, file.id));
  await conn.insert(loanStageHistory).values({ loanFileId: file.id, fromStage: file.stage, toStage: to, note });
  await logActivity(ENTITY, file.id, "stage", `Moved to ${STAGE_LABELS[to]}${note ? ` — ${note}` : ""}`, { from: file.stage, to }, conn);
}

export async function getFile(id: string, conn: DbOrTx = db) {
  const [file] = await conn.select().from(loanFiles).where(eq(loanFiles.id, id));
  if (!file) throw new DsaError("That file no longer exists");
  return file;
}

async function payoutForFile(fileId: string, conn: DbOrTx) {
  const [p] = await conn.select().from(payouts).where(eq(payouts.loanFileId, fileId));
  return p ?? null;
}

/**
 * Moves a file to a new stage, collecting the fields that stage needs. Returns a friendly message and
 * whether this is a moment worth celebrating. Run inside a transaction.
 */
export async function moveFileStage(fileId: string, to: LoanStage, input: StageMoveInput, conn: DbOrTx): Promise<{ message: string; celebrate: boolean }> {
  const file = await getFile(fileId, conn);
  if (file.stage === to) throw new DsaError(`Already in ${STAGE_LABELS[to]}`);
  const payout = await payoutForFile(file.id, conn);
  const note = input.note?.trim() ?? "";

  if (payout && payout.status !== "expected") {
    const allowed = payout.status === "invoiced" && to === "payout_received";
    if (!allowed) throw new DsaError(`The payout is already ${payout.status} — this file stays where it is.`);
  }

  // Leaving the disbursed side of the pipeline drops an un-invoiced expected payout.
  const dropsPayout = payout && payout.status === "expected" && (to === "rejected" || to === "dropped" || stageIndex(to) < stageIndex("disbursed"));

  switch (to) {
    case "logged_in": {
      const applicationNo = input.applicationNo ?? file.applicationNo;
      const loginDate = input.loginDate ?? file.loginDate;
      const lenderId = input.lenderId ?? file.lenderId;
      if (!lenderId) throw new DsaError("Pick the lender the file was logged in with");
      if (!applicationNo) throw new DsaError("Add the application / LAN number");
      if (!loginDate) throw new DsaError("Add the login date");
      await setStage(file, to, { applicationNo, loginDate, lenderId, closeReason: null }, note || `App no. ${applicationNo}`, conn);
      break;
    }
    case "sanctioned": {
      const sanctionedPaise = input.sanctionedPaise ?? file.sanctionedPaise;
      const sanctionDate = input.sanctionDate ?? file.sanctionDate;
      if (!sanctionedPaise || sanctionedPaise <= 0) throw new DsaError("Enter the sanctioned amount");
      if (!sanctionDate) throw new DsaError("Add the sanction date");
      await setStage(file, to, { sanctionedPaise, sanctionDate, closeReason: null }, note || formatINR(sanctionedPaise, { whole: true }), conn);
      break;
    }
    case "disbursed": {
      const disbursedPaise = input.disbursedPaise ?? file.disbursedPaise;
      const disbursalDate = input.disbursalDate ?? file.disbursalDate;
      const lenderId = input.lenderId ?? file.lenderId;
      if (!disbursedPaise || disbursedPaise <= 0) throw new DsaError("Enter the disbursed amount");
      if (!disbursalDate) throw new DsaError("Add the disbursal date");
      if (!lenderId) throw new DsaError("Pick the lender that disbursed");
      await setStage(file, to, { disbursedPaise, disbursalDate, lenderId, closeReason: null }, note || formatINR(disbursedPaise, { whole: true }), conn);
      await upsertExpectedPayout(file.id, conn);
      break;
    }
    case "payout_invoiced": {
      if (!payout) throw new DsaError("Mark the file disbursed first — then invoice the payout");
      await invoicePayout(payout.id, { invoiceNo: input.invoiceNo ?? null, invoiceDate: input.invoiceDate ?? null }, conn);
      return { message: "Payout invoiced — now we wait for the money", celebrate: false };
    }
    case "payout_received": {
      if (!payout) throw new DsaError("Mark the file disbursed first — then record the payout");
      await receivePayout(
        payout.id,
        { receivedDate: input.receivedDate ?? null, netReceivedPaise: input.netReceivedPaise ?? null, tdsPaise: input.tdsPaise ?? null, accountId: input.accountId ?? null },
        conn,
      );
      return { message: "Payout received 🎉 Money's in the books", celebrate: true };
    }
    case "rejected":
    case "dropped": {
      const closeReason = input.closeReason ?? note;
      if (!closeReason) throw new DsaError("Add a short reason — it helps spot patterns later");
      await setStage(file, to, { closeReason }, closeReason, conn);
      break;
    }
    default:
      await setStage(file, to, { closeReason: null }, note, conn);
  }

  if (dropsPayout && payout) {
    await conn.delete(payouts).where(eq(payouts.id, payout.id));
    await conn.update(loanFiles).set({ expectedPayoutPaise: null }).where(eq(loanFiles.id, file.id));
  }

  if (to === "sanctioned") return { message: "Sanctioned 🎉 Great work", celebrate: true };
  if (to === "disbursed") return { message: "Disbursed 🎉 Payout is on its way", celebrate: true };
  if (to === "rejected") return { message: "Marked rejected — on to the next one", celebrate: false };
  if (to === "dropped") return { message: "File dropped", celebrate: false };
  return { message: `Moved to ${STAGE_LABELS[to]}`, celebrate: false };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

/**
 * Snapshots the payout rate from the grid and creates (or refreshes) the expected payout for a
 * disbursed file. With no grid row the payout is still created with gross 0, so it shows up and
 * can be fixed with an inline rate.
 */
export async function upsertExpectedPayout(fileId: string, conn: DbOrTx = db) {
  const file = await getFile(fileId, conn);
  if (!file.disbursedPaise || !file.disbursalDate || !file.lenderId) throw new DsaError("The file needs a lender, disbursed amount and date");
  const [lender] = await conn.select().from(lenders).where(eq(lenders.id, file.lenderId));
  const grid = await conn.select().from(payoutRates).where(and(eq(payoutRates.lenderId, file.lenderId), eq(payoutRates.product, file.product)));
  const row = findPayoutRate(grid, file.lenderId, file.product, file.disbursedPaise);
  const rateBps = row?.rateBps ?? file.payoutRateBps ?? null;

  const [borrower] = await conn.select().from(borrowers).where(eq(borrowers.id, file.borrowerId));
  const subConnectorId = file.subConnectorId ?? borrower?.subConnectorId ?? null;
  let shareBps = 0;
  if (subConnectorId) {
    const [sc] = await conn.select().from(subConnectors).where(eq(subConnectors.id, subConnectorId));
    shareBps = sc?.shareBps ?? 0;
  }
  const { finance } = await getSettings();
  const amounts = computePayout(file.disbursedPaise, rateBps, { gstBps: finance.commissionGstBps, tdsBps: finance.commissionTdsBps, subShareBps: shareBps });

  await conn.update(loanFiles).set({ payoutRateBps: rateBps, expectedPayoutPaise: amounts.grossPaise }).where(eq(loanFiles.id, file.id));

  const values = {
    lenderId: file.lenderId,
    expectedDate: expectedPayoutDate(file.disbursalDate, lender?.payoutDays ?? 30),
    grossPaise: amounts.grossPaise,
    gstPaise: amounts.gstPaise,
    tdsPaise: amounts.tdsPaise,
    subConnectorId,
    subConnectorSharePaise: amounts.subConnectorSharePaise,
  };
  const existing = await payoutForFile(file.id, conn);
  let payout: Payout;
  if (existing) {
    if (existing.status !== "expected") return existing;
    [payout] = await conn.update(payouts).set(values).where(eq(payouts.id, existing.id)).returning();
  } else {
    [payout] = await conn.insert(payouts).values({ loanFileId: file.id, status: "expected", ...values }).returning();
  }
  await logActivity(
    ENTITY,
    file.id,
    "payout",
    rateBps ? `Expected payout ${formatINR(amounts.grossPaise, { whole: true })} at ${bpsToPercent(rateBps)}%` : "Payout created — rate not set yet",
    null,
    conn,
  );
  return payout;
}

/** Sets the payout rate on a file by hand (and optionally saves it to the lender's grid). */
export async function setFilePayoutRate(fileId: string, rateBps: number, saveToGrid: boolean, conn: DbOrTx) {
  if (rateBps <= 0 || rateBps > 10_000) throw new DsaError("Rate should be between 0 and 100%");
  const file = await getFile(fileId, conn);
  if (saveToGrid) {
    if (!file.lenderId) throw new DsaError("Pick a lender first to save the rate to its grid");
    await conn.insert(payoutRates).values({ lenderId: file.lenderId, product: file.product, minTicketPaise: 0, maxTicketPaise: null, rateBps, notes: "Added from a file" });
  }
  await conn.update(loanFiles).set({ payoutRateBps: rateBps }).where(eq(loanFiles.id, file.id));
  await logActivity(ENTITY, file.id, "payout_rate", `Payout rate set to ${bpsToPercent(rateBps)}%`, null, conn);
  const payout = await payoutForFile(file.id, conn);
  if (payout && payout.status === "expected" && file.disbursedPaise) {
    // Re-run with the grid first, then the manual rate as fallback.
    if (!saveToGrid) {
      const { finance } = await getSettings();
      let shareBps = 0;
      if (payout.subConnectorId) {
        const [sc] = await conn.select().from(subConnectors).where(eq(subConnectors.id, payout.subConnectorId));
        shareBps = sc?.shareBps ?? 0;
      }
      const a = computePayout(file.disbursedPaise, rateBps, { gstBps: finance.commissionGstBps, tdsBps: finance.commissionTdsBps, subShareBps: shareBps });
      await conn
        .update(payouts)
        .set({ grossPaise: a.grossPaise, gstPaise: a.gstPaise, tdsPaise: a.tdsPaise, subConnectorSharePaise: a.subConnectorSharePaise })
        .where(eq(payouts.id, payout.id));
      await conn.update(loanFiles).set({ expectedPayoutPaise: a.grossPaise }).where(eq(loanFiles.id, file.id));
    } else {
      await upsertExpectedPayout(file.id, conn);
    }
  }
}

/** Manual correction of a payout's amounts (before it is received). */
export async function editPayout(
  payoutId: string,
  input: { grossPaise: number; gstPaise?: number | null; tdsPaise?: number | null; subConnectorSharePaise?: number | null; expectedDate?: string | null; notes?: string | null },
  conn: DbOrTx,
) {
  const [p] = await conn.select().from(payouts).where(eq(payouts.id, payoutId));
  if (!p) throw new DsaError("Payout not found");
  if (p.status === "received") throw new DsaError("This payout is already received");
  if (input.grossPaise < 0) throw new DsaError("Gross can't be negative");
  const { finance } = await getSettings();
  const auto = payoutBreakdown(input.grossPaise, { gstBps: finance.commissionGstBps, tdsBps: finance.commissionTdsBps });
  await conn
    .update(payouts)
    .set({
      grossPaise: input.grossPaise,
      gstPaise: input.gstPaise ?? auto.gstPaise,
      tdsPaise: input.tdsPaise ?? auto.tdsPaise,
      subConnectorSharePaise: input.subConnectorSharePaise ?? p.subConnectorSharePaise,
      expectedDate: input.expectedDate ?? p.expectedDate,
      notes: input.notes ?? p.notes,
    })
    .where(eq(payouts.id, p.id));
  await conn.update(loanFiles).set({ expectedPayoutPaise: input.grossPaise }).where(eq(loanFiles.id, p.loanFileId));
  await logActivity(ENTITY, p.loanFileId, "payout", `Payout updated — gross ${formatINR(input.grossPaise, { whole: true })}`, null, conn);
}

export async function invoicePayout(payoutId: string, input: { invoiceNo: string | null; invoiceDate: string | null }, conn: DbOrTx) {
  const [p] = await conn.select().from(payouts).where(eq(payouts.id, payoutId));
  if (!p) throw new DsaError("Payout not found");
  if (p.status !== "expected") throw new DsaError(`This payout is already ${p.status}`);
  if (!input.invoiceNo) throw new DsaError("Add the invoice number");
  if (!input.invoiceDate) throw new DsaError("Add the invoice date");
  if (p.grossPaise <= 0) throw new DsaError("Set the payout rate first so the invoice has an amount");
  await conn.update(payouts).set({ status: "invoiced", invoiceNo: input.invoiceNo, invoiceDate: input.invoiceDate }).where(eq(payouts.id, p.id));
  const file = await getFile(p.loanFileId, conn);
  if (file.stage === "disbursed") await setStage(file, "payout_invoiced", {}, `Invoice ${input.invoiceNo}`, conn);
  else await logActivity(ENTITY, file.id, "payout", `Payout invoiced — ${input.invoiceNo}`, null, conn);
}

/**
 * Records the lender's payment: books the income (net received, with TDS and GST noted), marks the
 * payout received and moves the file to "Payout received". Run inside a transaction.
 */
export async function receivePayout(
  payoutId: string,
  input: { receivedDate: string | null; netReceivedPaise: number | null; tdsPaise?: number | null; accountId: string | null },
  conn: DbOrTx,
) {
  const [p] = await conn.select().from(payouts).where(eq(payouts.id, payoutId));
  if (!p) throw new DsaError("Payout not found");
  if (p.status === "received") throw new DsaError("Already received — nothing to do");
  if (!input.receivedDate) throw new DsaError("Add the date the money came in");
  if (!input.accountId) throw new DsaError("Pick the account it landed in");
  if (p.grossPaise <= 0) throw new DsaError("Set the payout rate first so we know the gross");
  const net = input.netReceivedPaise ?? netOf(p);
  if (!net || net <= 0) throw new DsaError("Enter the amount received");
  const tds = input.tdsPaise ?? p.tdsPaise;

  const file = await getFile(p.loanFileId, conn);
  const [borrower] = await conn.select().from(borrowers).where(eq(borrowers.id, file.borrowerId));
  const [lender] = p.lenderId ? await conn.select().from(lenders).where(eq(lenders.id, p.lenderId)) : [];
  const [cat] = await conn
    .select()
    .from(categories)
    .where(and(ilike(categories.name, "DSA commission"), eq(categories.kind, "income")))
    .orderBy(asc(categories.name))
    .limit(1);

  const txn = await createTransaction(
    {
      workspace: "dsa",
      type: "income",
      date: input.receivedDate,
      accountId: input.accountId,
      amountPaise: net,
      tdsPaise: tds,
      gstPaise: p.gstPaise,
      payoutId: p.id,
      categoryId: cat?.id ?? null,
      party: lender?.name ?? null,
      description: `DSA payout — ${borrower?.name ?? "borrower"}${file.applicationNo ? ` (${file.applicationNo})` : ""}`,
      reference: p.invoiceNo,
    },
    conn,
  );
  await conn
    .update(payouts)
    .set({ status: "received", receivedDate: input.receivedDate, netReceivedPaise: net, tdsPaise: tds, transactionId: txn.id })
    .where(eq(payouts.id, p.id));
  await setStage(file, "payout_received", {}, `${formatINR(net, { whole: true })} received`, conn);
  return txn;
}

/** Pays the sub-connector their share: books an expense and stamps the paid date. */
export async function paySubConnector(payoutId: string, input: { date: string | null; accountId: string | null; amountPaise: number | null }, conn: DbOrTx) {
  const [p] = await conn.select().from(payouts).where(eq(payouts.id, payoutId));
  if (!p) throw new DsaError("Payout not found");
  if (!p.subConnectorId) throw new DsaError("No partner on this file");
  if (p.subConnectorPaidDate) throw new DsaError("Partner already paid");
  if (!input.date) throw new DsaError("Add the payment date");
  if (!input.accountId) throw new DsaError("Pick the account you paid from");
  const amount = input.amountPaise ?? p.subConnectorSharePaise;
  if (!amount || amount <= 0) throw new DsaError("Enter the amount paid");
  const [sc] = await conn.select().from(subConnectors).where(eq(subConnectors.id, p.subConnectorId));
  const file = await getFile(p.loanFileId, conn);
  const [borrower] = await conn.select().from(borrowers).where(eq(borrowers.id, file.borrowerId));
  const [cat] = await conn
    .select()
    .from(categories)
    .where(and(ilike(categories.name, "Sub-connector payouts"), eq(categories.kind, "expense")))
    .limit(1);
  const txn = await createTransaction(
    {
      workspace: "dsa",
      type: "expense",
      date: input.date,
      accountId: input.accountId,
      amountPaise: amount,
      categoryId: cat?.id ?? null,
      party: sc?.name ?? null,
      description: `Partner share — ${borrower?.name ?? "file"}`,
      payoutId: p.id,
    },
    conn,
  );
  await conn.update(payouts).set({ subConnectorPaidDate: input.date, subConnectorSharePaise: amount }).where(eq(payouts.id, p.id));
  await logActivity(ENTITY, file.id, "partner_paid", `${sc?.name ?? "Partner"} paid ${formatINR(amount, { whole: true })}`, null, conn);
  return txn;
}
