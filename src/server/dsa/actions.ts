"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  ACTIVITY_TYPES,
  LOAN_PRODUCTS,
  LOAN_STAGES,
  PENDING_WITH,
  activities,
  borrowers,
  lenders,
  loanDocuments,
  loanFiles,
  payoutRates,
  payouts,
  subConnectors,
  tasks,
  type ActivityType,
  type LoanProduct,
  type PendingWith,
} from "@/db/schema";
import { requireUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import { bool, day, done, fail, int, str, type ActionResult } from "@/lib/action";
import { parseRupeesToPaise, percentToBps, formatINR } from "@/lib/money";
import { addDays, fromDateTimeLocalIST, istToInstant, todayIST } from "@/lib/dates";
import {
  DOC_NEXT_STATUS,
  DOC_STATUS_LABELS,
  EMPLOYMENT_LABELS,
  LENDER_TYPE_LABELS,
  PENDING_LABELS,
  type DocStatus,
  type EmploymentType,
  type LenderType,
} from "./constants";
import {
  DsaError,
  ENTITY,
  createLoanFile,
  editPayout,
  invoicePayout,
  moveFileStage,
  paySubConnector,
  receivePayout,
  setFilePayoutRate,
} from "./service";

function refresh(...paths: string[]) {
  for (const p of new Set(["/dsa", ...paths])) revalidatePath(p);
}

async function guard(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DsaError) return fail(e.message);
    if (e instanceof Error && /amount must be greater than zero/i.test(e.message)) return fail("Amount must be greater than zero");
    throw e;
  }
}

function pick<T extends string>(form: FormData, key: string, allowed: readonly T[]): T | null {
  const v = str(form, key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function money(form: FormData, key: string): number | null | "bad" {
  const raw = str(form, key);
  if (raw == null) return null;
  const p = parseRupeesToPaise(raw);
  return p == null ? "bad" : p;
}

const EMPLOYMENT = Object.keys(EMPLOYMENT_LABELS) as EmploymentType[];
const LENDER_TYPES = Object.keys(LENDER_TYPE_LABELS) as LenderType[];
const DOC_STATUSES = Object.keys(DOC_STATUS_LABELS) as DocStatus[];

// ---------------------------------------------------------------------------
// Borrowers
// ---------------------------------------------------------------------------

function borrowerFields(form: FormData, prefix = "") {
  const income = money(form, `${prefix}monthlyIncome`);
  if (income === "bad") return { error: "Monthly income doesn't look like an amount" } as const;
  const cibil = int(form, `${prefix}cibilScore`);
  if (cibil != null && (cibil < 300 || cibil > 900)) return { error: "CIBIL scores run from 300 to 900" } as const;
  const name = str(form, `${prefix}name`);
  if (!name) return { error: "Add the borrower's name" } as const;
  return {
    values: {
      name,
      phone: str(form, `${prefix}phone`),
      email: str(form, `${prefix}email`),
      city: str(form, `${prefix}city`),
      employmentType: pick(form, `${prefix}employmentType`, EMPLOYMENT),
      monthlyIncomePaise: income,
      cibilScore: cibil,
      source: str(form, `${prefix}source`),
      subConnectorId: str(form, `${prefix}subConnectorId`),
      notes: str(form, `${prefix}notes`) ?? "",
    },
  } as const;
}

export async function createBorrowerAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const f = borrowerFields(form);
  if ("error" in f) return fail(f.error!);
  const [b] = await db.insert(borrowers).values(f.values).returning();
  await logActivity("borrower", b.id, "created", "Borrower added");
  refresh("/dsa/borrowers");
  return done(`${b.name} added`, { redirectTo: `/dsa/borrowers/${b.id}` });
}

export async function updateBorrowerAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing borrower");
  const f = borrowerFields(form);
  if ("error" in f) return fail(f.error!);
  await db.update(borrowers).set(f.values).where(eq(borrowers.id, id));
  await logActivity("borrower", id, "updated", "Details updated");
  refresh("/dsa/borrowers", `/dsa/borrowers/${id}`);
  const fileIds = await db.select({ id: loanFiles.id }).from(loanFiles).where(eq(loanFiles.borrowerId, id));
  for (const f2 of fileIds) revalidatePath(`/dsa/files/${f2.id}`);
  return done("Saved");
}

export async function deleteBorrowerAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing borrower");
  const files = await db.select({ id: loanFiles.id }).from(loanFiles).where(eq(loanFiles.borrowerId, id));
  if (files.length) {
    const paid = await db.select({ id: payouts.id }).from(payouts).where(and(inArray(payouts.loanFileId, files.map((f) => f.id)), eq(payouts.status, "received")));
    if (paid.length) return fail("This borrower has a received payout in the books — keep the record");
  }
  await db.delete(borrowers).where(eq(borrowers.id, id));
  refresh("/dsa/borrowers");
  return done("Borrower removed", { redirectTo: "/dsa/borrowers" });
}

// ---------------------------------------------------------------------------
// Loan files
// ---------------------------------------------------------------------------

export async function createLoanFileAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const product = pick(form, "product", LOAN_PRODUCTS);
  if (!product) return fail("Pick a loan product");
  const amount = money(form, "amountRequested");
  if (amount === "bad" || amount == null || amount <= 0) return fail("Enter the loan amount required");
  const lenderId = str(form, "lenderId");
  const mode = str(form, "borrowerMode") ?? "existing";

  return guard(async () => {
    const file = await db.transaction(async (tx) => {
      let borrowerId = str(form, "borrowerId");
      if (mode === "new") {
        const f = borrowerFields(form, "b_");
        if ("error" in f) throw new DsaError(f.error!);
        const [b] = await tx.insert(borrowers).values(f.values).returning();
        await logActivity("borrower", b.id, "created", "Borrower added", null, tx);
        borrowerId = b.id;
      }
      if (!borrowerId) throw new DsaError("Pick a borrower or add a new one");
      return createLoanFile(
        { borrowerId, product, amountRequestedPaise: amount, lenderId, subConnectorId: str(form, "subConnectorId"), notes: str(form, "notes") ?? "" },
        tx,
      );
    });
    refresh("/dsa/borrowers");
    return done("New file opened — checklist is ready", { redirectTo: `/dsa/files/${file.id}` });
  });
}

export async function updateLoanFileAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing file");
  const product = pick(form, "product", LOAN_PRODUCTS);
  if (!product) return fail("Pick a loan product");
  const amount = money(form, "amountRequested");
  if (amount === "bad" || amount == null || amount <= 0) return fail("Enter the loan amount required");
  const sanctioned = money(form, "sanctioned");
  const disbursed = money(form, "disbursed");
  if (sanctioned === "bad" || disbursed === "bad") return fail("Check the amounts");
  await db
    .update(loanFiles)
    .set({
      product,
      amountRequestedPaise: amount,
      lenderId: str(form, "lenderId"),
      subConnectorId: str(form, "subConnectorId"),
      applicationNo: str(form, "applicationNo"),
      loginDate: day(form, "loginDate"),
      sanctionedPaise: sanctioned,
      sanctionDate: day(form, "sanctionDate"),
      disbursedPaise: disbursed,
      disbursalDate: day(form, "disbursalDate"),
      notes: str(form, "notes") ?? "",
    })
    .where(eq(loanFiles.id, id));
  await logActivity(ENTITY, id, "updated", "File details updated");
  refresh(`/dsa/files/${id}`, "/dsa/payouts");
  return done("Saved");
}

export async function deleteLoanFileAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing file");
  const [p] = await db.select().from(payouts).where(eq(payouts.loanFileId, id));
  if (p?.status === "received") return fail("This file's payout is already in the books — keep it for your records");
  await db.delete(tasks).where(and(eq(tasks.linkedType, "loan_file"), eq(tasks.linkedId, id)));
  await db.delete(loanFiles).where(eq(loanFiles.id, id));
  refresh("/dsa/payouts", "/dsa/borrowers");
  return done("File deleted", { redirectTo: "/dsa" });
}

export async function moveStageAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "fileId");
  const to = pick(form, "stage", LOAN_STAGES);
  if (!id || !to) return fail("Pick a stage");
  const amounts = { sanctioned: money(form, "sanctioned"), disbursed: money(form, "disbursed"), net: money(form, "netReceived"), tds: money(form, "tds") };
  if (Object.values(amounts).includes("bad")) return fail("One of the amounts doesn't look right");
  return guard(async () => {
    const res = await db.transaction((tx) =>
      moveFileStage(
        id,
        to,
        {
          note: str(form, "note"),
          applicationNo: str(form, "applicationNo"),
          loginDate: day(form, "loginDate"),
          lenderId: str(form, "lenderId"),
          sanctionedPaise: amounts.sanctioned as number | null,
          sanctionDate: day(form, "sanctionDate"),
          disbursedPaise: amounts.disbursed as number | null,
          disbursalDate: day(form, "disbursalDate"),
          closeReason: str(form, "closeReason"),
          invoiceNo: str(form, "invoiceNo"),
          invoiceDate: day(form, "invoiceDate"),
          receivedDate: day(form, "receivedDate"),
          netReceivedPaise: amounts.net as number | null,
          tdsPaise: amounts.tds as number | null,
          accountId: str(form, "accountId"),
        },
        tx,
      ),
    );
    refresh(`/dsa/files/${id}`, "/dsa/payouts", "/dsa/lenders", "/dsa/partners", "/books");
    return done(res.message, { celebrate: res.celebrate });
  });
}

export async function updatePendingAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "fileId");
  const pendingWith = pick<PendingWith>(form, "pendingWith", PENDING_WITH);
  if (!id || !pendingWith) return fail("Pick who it's pending with");
  const note = str(form, "pendingNote") ?? "";
  const [before] = await db.select().from(loanFiles).where(eq(loanFiles.id, id));
  if (!before) return fail("That file no longer exists");
  await db.update(loanFiles).set({ pendingWith, pendingNote: note }).where(eq(loanFiles.id, id));
  if (before.pendingWith !== pendingWith) {
    await logActivity(ENTITY, id, "pending_changed", `Now pending with ${PENDING_LABELS[pendingWith].toLowerCase()}${note ? ` — ${note}` : ""}`);
  } else if (before.pendingNote !== note) {
    await logActivity(ENTITY, id, "pending_note", note ? `Pending note: ${note}` : "Pending note cleared");
  }
  refresh(`/dsa/files/${id}`);
  return done(pendingWith === "none" ? "Nothing pending — nice" : `Pending with ${PENDING_LABELS[pendingWith].toLowerCase()}`);
}

export async function setFollowUpAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "fileId");
  if (!id) return fail("Missing file");
  const quick = int(form, "inDays");
  let at: Date | null;
  if (str(form, "clear")) at = null;
  else if (quick != null) at = istToInstant(addDays(todayIST(), quick), "10:00");
  else {
    at = fromDateTimeLocalIST(str(form, "at"));
    if (!at) return fail("Pick a date and time");
  }
  await db.update(loanFiles).set({ nextFollowUpAt: at }).where(eq(loanFiles.id, id));
  refresh(`/dsa/files/${id}`);
  return done(at ? "Follow-up set" : "Follow-up cleared");
}

export async function setPayoutRateAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "fileId");
  const bps = percentToBps(str(form, "rate"));
  if (!id) return fail("Missing file");
  if (bps == null) return fail("Enter the payout rate in %");
  return guard(async () => {
    await db.transaction((tx) => setFilePayoutRate(id, bps, bool(form, "saveToGrid"), tx));
    refresh(`/dsa/files/${id}`, "/dsa/payouts", "/dsa/lenders");
    return done("Payout rate set — numbers updated");
  });
}

// ---------------------------------------------------------------------------
// Document checklist
// ---------------------------------------------------------------------------

async function docFile(docId: string) {
  const [d] = await db.select().from(loanDocuments).where(eq(loanDocuments.id, docId));
  return d ?? null;
}

export async function setDocStatusAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing document");
  const d = await docFile(id);
  if (!d) return fail("That item is gone");
  const status = pick(form, "status", DOC_STATUSES) ?? DOC_NEXT_STATUS[d.status];
  await db
    .update(loanDocuments)
    .set({ status, receivedAt: status === "received" || status === "submitted" ? (d.receivedAt ?? new Date()) : null })
    .where(eq(loanDocuments.id, id));
  refresh(`/dsa/files/${d.loanFileId}`);
  return done(`${d.name}: ${DOC_STATUS_LABELS[status].toLowerCase()}`);
}

export async function addDocAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const fileId = str(form, "fileId");
  const name = str(form, "name");
  if (!fileId) return fail("Missing file");
  if (!name) return fail("Name the document");
  const existing = await db.select({ sort: loanDocuments.sort }).from(loanDocuments).where(eq(loanDocuments.loanFileId, fileId));
  await db.insert(loanDocuments).values({ loanFileId: fileId, name, sort: existing.reduce((m, r) => Math.max(m, r.sort), -1) + 1 });
  refresh(`/dsa/files/${fileId}`);
  return done("Added to the checklist");
}

export async function deleteDocAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing document");
  const [d] = await db.delete(loanDocuments).where(eq(loanDocuments.id, id)).returning();
  if (d) refresh(`/dsa/files/${d.loanFileId}`);
  return done("Removed");
}

// ---------------------------------------------------------------------------
// Activities (calls, visits) and linked tasks
// ---------------------------------------------------------------------------

export async function addActivityAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const type = pick<ActivityType>(form, "type", ACTIVITY_TYPES) ?? "call";
  const subject = str(form, "subject");
  if (!subject) return fail("What was it about?");
  const loanFileId = str(form, "loanFileId");
  let borrowerId = str(form, "borrowerId");
  if (loanFileId && !borrowerId) {
    const [f] = await db.select({ borrowerId: loanFiles.borrowerId }).from(loanFiles).where(eq(loanFiles.id, loanFileId));
    borrowerId = f?.borrowerId ?? null;
  }
  if (!loanFileId && !borrowerId) return fail("Missing file or borrower");
  await db.insert(activities).values({
    workspace: "dsa",
    type,
    subject,
    body: str(form, "body") ?? "",
    outcome: str(form, "outcome"),
    nextStep: str(form, "nextStep"),
    at: fromDateTimeLocalIST(str(form, "at")) ?? new Date(),
    loanFileId,
    borrowerId,
  });
  if (loanFileId) revalidatePath(`/dsa/files/${loanFileId}`);
  if (borrowerId) revalidatePath(`/dsa/borrowers/${borrowerId}`);
  return done("Logged");
}

export async function deleteActivityAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing activity");
  const [a] = await db.delete(activities).where(eq(activities.id, id)).returning();
  if (a?.loanFileId) revalidatePath(`/dsa/files/${a.loanFileId}`);
  if (a?.borrowerId) revalidatePath(`/dsa/borrowers/${a.borrowerId}`);
  return done("Removed");
}

export async function addFileTaskAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const fileId = str(form, "fileId");
  const title = str(form, "title");
  if (!fileId) return fail("Missing file");
  if (!title) return fail("What needs doing?");
  await db.insert(tasks).values({ workspace: "dsa", title, dueDate: day(form, "dueDate"), linkedType: "loan_file", linkedId: fileId, priority: int(form, "priority") ?? 3 });
  refresh(`/dsa/files/${fileId}`, "/tasks", "/");
  return done("Task added");
}

export async function toggleFileTaskAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing task");
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!t) return fail("That task is gone");
  const finished = t.status !== "done";
  await db
    .update(tasks)
    .set({ status: finished ? "done" : "todo", completedAt: finished ? new Date() : null })
    .where(eq(tasks.id, id));
  if (t.linkedId) revalidatePath(`/dsa/files/${t.linkedId}`);
  refresh("/tasks", "/");
  return done(finished ? "Done ✓" : "Reopened");
}

// ---------------------------------------------------------------------------
// Lenders and payout grid
// ---------------------------------------------------------------------------

function lenderFields(form: FormData) {
  const name = str(form, "name");
  if (!name) return { error: "Add the lender's name" } as const;
  const payoutDays = int(form, "payoutDays") ?? 30;
  if (payoutDays < 0 || payoutDays > 365) return { error: "Payout days should be between 0 and 365" } as const;
  return {
    values: {
      name,
      type: pick(form, "type", LENDER_TYPES) ?? "bank",
      dsaCode: str(form, "dsaCode"),
      rmName: str(form, "rmName"),
      rmPhone: str(form, "rmPhone"),
      rmEmail: str(form, "rmEmail"),
      payoutDays,
      notes: str(form, "notes") ?? "",
      active: form.has("active") ? bool(form, "active") : true,
    },
  } as const;
}

export async function createLenderAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const f = lenderFields(form);
  if ("error" in f) return fail(f.error!);
  const [l] = await db.insert(lenders).values(f.values).returning();
  await logActivity("lender", l.id, "created", "Lender added");
  refresh("/dsa/lenders");
  return done(`${l.name} added — set up its payout grid next`, { redirectTo: `/dsa/lenders/${l.id}` });
}

export async function updateLenderAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing lender");
  const f = lenderFields(form);
  if ("error" in f) return fail(f.error!);
  await db.update(lenders).set({ ...f.values, active: bool(form, "active") }).where(eq(lenders.id, id));
  await logActivity("lender", id, "updated", "Details updated");
  refresh("/dsa/lenders", `/dsa/lenders/${id}`);
  return done("Saved");
}

export async function deleteLenderAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing lender");
  const files = await db.select({ id: loanFiles.id }).from(loanFiles).where(eq(loanFiles.lenderId, id)).limit(1);
  if (files.length) return fail("This lender has files — mark it inactive instead");
  await db.delete(lenders).where(eq(lenders.id, id));
  refresh("/dsa/lenders");
  return done("Lender removed", { redirectTo: "/dsa/lenders" });
}

/** Ticket in rupees or lakhs, depending on the unit field. */
function ticket(form: FormData, key: string, unit: string | null): number | null | "bad" {
  const raw = str(form, key);
  if (raw == null) return null;
  const p = parseRupeesToPaise(raw);
  if (p == null || p < 0) return "bad";
  return unit === "lakhs" ? p * 100_000 : unit === "crores" ? p * 10_000_000 : p;
}

function rateFields(form: FormData) {
  const product = pick<LoanProduct>(form, "product", LOAN_PRODUCTS);
  if (!product) return { error: "Pick a product" } as const;
  const unit = str(form, "unit");
  const min = ticket(form, "minTicket", unit);
  const max = ticket(form, "maxTicket", unit);
  if (min === "bad" || max === "bad") return { error: "Check the ticket sizes" } as const;
  if (min != null && max != null && max < min) return { error: "Max ticket should be above the min" } as const;
  const rateBps = percentToBps(str(form, "rate"));
  if (rateBps == null || rateBps <= 0 || rateBps > 10_000) return { error: "Enter a payout rate in %, e.g. 0.65" } as const;
  return { values: { product, minTicketPaise: min ?? 0, maxTicketPaise: max, rateBps, notes: str(form, "notes") ?? "" } } as const;
}

export async function addRateAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const lenderId = str(form, "lenderId");
  if (!lenderId) return fail("Missing lender");
  const f = rateFields(form);
  if ("error" in f) return fail(f.error!);
  await db.insert(payoutRates).values({ lenderId, ...f.values });
  refresh(`/dsa/lenders/${lenderId}`, "/dsa/lenders");
  return done("Rate added to the grid");
}

export async function updateRateAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing rate");
  const f = rateFields(form);
  if ("error" in f) return fail(f.error!);
  const [r] = await db.update(payoutRates).set(f.values).where(eq(payoutRates.id, id)).returning();
  if (r) refresh(`/dsa/lenders/${r.lenderId}`);
  return done("Rate updated");
}

export async function deleteRateAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing rate");
  const [r] = await db.delete(payoutRates).where(eq(payoutRates.id, id)).returning();
  if (r) refresh(`/dsa/lenders/${r.lenderId}`);
  return done("Rate removed");
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

async function payoutPaths(payoutId: string) {
  const [p] = await db.select({ fileId: payouts.loanFileId }).from(payouts).where(eq(payouts.id, payoutId));
  return p ? [`/dsa/files/${p.fileId}`] : [];
}

export async function markInvoicedAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "payoutId");
  if (!id) return fail("Missing payout");
  return guard(async () => {
    await db.transaction((tx) => invoicePayout(id, { invoiceNo: str(form, "invoiceNo"), invoiceDate: day(form, "invoiceDate") }, tx));
    refresh("/dsa/payouts", ...(await payoutPaths(id)));
    return done("Invoiced — the lender has it now");
  });
}

export async function markReceivedAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "payoutId");
  if (!id) return fail("Missing payout");
  const net = money(form, "netReceived");
  const tds = money(form, "tds");
  if (net === "bad" || tds === "bad") return fail("Check the amounts");
  return guard(async () => {
    const txn = await db.transaction((tx) => receivePayout(id, { receivedDate: day(form, "receivedDate"), netReceivedPaise: net, tdsPaise: tds, accountId: str(form, "accountId") }, tx));
    refresh("/dsa/payouts", "/dsa/lenders", "/books", "/books/transactions", ...(await payoutPaths(id)));
    return done(`${formatINR(txn.amountPaise, { whole: true })} received 🎉`, { celebrate: true });
  });
}

export async function markPartnerPaidAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "payoutId");
  if (!id) return fail("Missing payout");
  const amount = money(form, "amount");
  if (amount === "bad") return fail("Check the amount");
  return guard(async () => {
    await db.transaction((tx) => paySubConnector(id, { date: day(form, "date"), accountId: str(form, "accountId"), amountPaise: amount }, tx));
    refresh("/dsa/payouts", "/dsa/partners", "/books", ...(await payoutPaths(id)));
    return done("Partner paid — thanks for keeping it fair");
  });
}

export async function editPayoutAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "payoutId");
  if (!id) return fail("Missing payout");
  const gross = money(form, "gross");
  const gst = money(form, "gst");
  const tds = money(form, "tds");
  const share = money(form, "share");
  if ([gross, gst, tds, share].includes("bad") || gross == null) return fail("Check the amounts");
  return guard(async () => {
    await db.transaction((tx) =>
      editPayout(
        id,
        {
          grossPaise: gross as number,
          gstPaise: gst as number | null,
          tdsPaise: tds as number | null,
          subConnectorSharePaise: share as number | null,
          expectedDate: day(form, "expectedDate"),
          notes: str(form, "notes"),
        },
        tx,
      ),
    );
    refresh("/dsa/payouts", ...(await payoutPaths(id)));
    return done("Payout updated");
  });
}

// ---------------------------------------------------------------------------
// Sub-connectors (partners)
// ---------------------------------------------------------------------------

function partnerFields(form: FormData) {
  const name = str(form, "name");
  if (!name) return { error: "Add the partner's name" } as const;
  const shareBps = percentToBps(str(form, "share")) ?? 0;
  if (shareBps < 0 || shareBps > 10_000) return { error: "Share should be between 0 and 100%" } as const;
  return { values: { name, phone: str(form, "phone"), shareBps, notes: str(form, "notes") ?? "" } } as const;
}

export async function createPartnerAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const f = partnerFields(form);
  if ("error" in f) return fail(f.error!);
  await db.insert(subConnectors).values(f.values);
  refresh("/dsa/partners");
  return done(`${f.values.name} added`);
}

export async function updatePartnerAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing partner");
  const f = partnerFields(form);
  if ("error" in f) return fail(f.error!);
  await db.update(subConnectors).set({ ...f.values, active: bool(form, "active") }).where(eq(subConnectors.id, id));
  refresh("/dsa/partners");
  return done("Saved");
}

export async function deletePartnerAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Missing partner");
  const used = await db.select({ id: payouts.id }).from(payouts).where(eq(payouts.subConnectorId, id)).limit(1);
  if (used.length) return fail("This partner has payouts — mark them inactive instead");
  await db.delete(subConnectors).where(eq(subConnectors.id, id));
  refresh("/dsa/partners");
  return done("Partner removed");
}

