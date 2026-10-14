import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  activities,
  activityLog,
  borrowers,
  lenders,
  loanDocuments,
  loanFiles,
  loanStageHistory,
  payoutRates,
  payouts,
  subConnectors,
  tasks,
  type LoanStage,
  type PayoutStatus,
} from "@/db/schema";
import { addDays, endOfMonth, financialYear, istToInstant, startOfMonth } from "@/lib/dates";
import { ACTIVE_STAGES } from "./constants";
import { approvalStats, avgLoginToDisbursal, funnel, totals } from "./logic";

/** Columns every file list needs: the file plus borrower and lender names. */
const fileCols = {
  file: loanFiles,
  borrowerName: borrowers.name,
  borrowerPhone: borrowers.phone,
  borrowerCity: borrowers.city,
  lenderName: lenders.name,
};

export type FileRow = Awaited<ReturnType<typeof listFiles>>[number];

export async function listFiles(where?: Parameters<typeof and>[0]) {
  return db
    .select(fileCols)
    .from(loanFiles)
    .innerJoin(borrowers, eq(borrowers.id, loanFiles.borrowerId))
    .leftJoin(lenders, eq(lenders.id, loanFiles.lenderId))
    .where(where)
    .orderBy(desc(loanFiles.stageChangedAt));
}

export async function activeFiles() {
  return listFiles(inArray(loanFiles.stage, ACTIVE_STAGES));
}

/** When each file's pending-with last changed (from its history). */
export async function pendingSinceMap(fileIds: string[]) {
  if (fileIds.length === 0) return new Map<string, Date>();
  const rows = await db
    .select({ id: activityLog.entityId, at: sql<Date>`max(${activityLog.at})` })
    .from(activityLog)
    .where(and(eq(activityLog.entityType, "loan_file"), eq(activityLog.action, "pending_changed"), inArray(activityLog.entityId, fileIds)))
    .groupBy(activityLog.entityId);
  return new Map(rows.map((r) => [r.id, new Date(r.at)]));
}

export async function stageHistories(fileIds: string[]) {
  const m = new Map<string, LoanStage[]>();
  if (fileIds.length === 0) return m;
  const rows = await db
    .select({ id: loanStageHistory.loanFileId, to: loanStageHistory.toStage })
    .from(loanStageHistory)
    .where(inArray(loanStageHistory.loanFileId, fileIds));
  for (const r of rows) m.set(r.id, [...(m.get(r.id) ?? []), r.to]);
  return m;
}

/** Document progress per file: received-or-submitted vs needed. */
export async function docProgress(fileIds: string[]) {
  const m = new Map<string, { done: number; total: number }>();
  if (fileIds.length === 0) return m;
  const rows = await db
    .select({
      id: loanDocuments.loanFileId,
      done: sql<number>`count(*) filter (where ${loanDocuments.status} in ('received','submitted'))::int`,
      total: sql<number>`count(*) filter (where ${loanDocuments.status} <> 'not_needed')::int`,
    })
    .from(loanDocuments)
    .where(inArray(loanDocuments.loanFileId, fileIds))
    .groupBy(loanDocuments.loanFileId);
  for (const r of rows) m.set(r.id, { done: Number(r.done), total: Number(r.total) });
  return m;
}

export async function lenderOptions(includeInactive = false) {
  return db
    .select({ id: lenders.id, name: lenders.name, active: lenders.active })
    .from(lenders)
    .where(includeInactive ? undefined : eq(lenders.active, true))
    .orderBy(asc(lenders.name));
}

export async function partnerOptions() {
  return db.select({ id: subConnectors.id, name: subConnectors.name, shareBps: subConnectors.shareBps }).from(subConnectors).where(eq(subConnectors.active, true)).orderBy(asc(subConnectors.name));
}

export async function borrowerOptions() {
  return db
    .select({ id: borrowers.id, name: borrowers.name, phone: borrowers.phone, city: borrowers.city })
    .from(borrowers)
    .orderBy(desc(borrowers.updatedAt))
    .limit(500);
}

/** Accounts money can land in for the DSA workspace (shared or DSA-only). */
export async function accountOptions() {
  return db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.archived, false), or(isNull(accounts.workspace), eq(accounts.workspace, "dsa"))))
    .orderBy(asc(accounts.name));
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function dashboardStats(today: string) {
  const mStart = startOfMonth(today);
  const mEnd = endOfMonth(today);
  const fy = financialYear(today);

  const [month] = await db
    .select({
      disbursed: sql<string>`coalesce(sum(${loanFiles.disbursedPaise}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(loanFiles)
    .where(and(gte(loanFiles.disbursalDate, mStart), lte(loanFiles.disbursalDate, mEnd)));

  const payoutRows = await db
    .select({
      status: payouts.status,
      grossPaise: payouts.grossPaise,
      gstPaise: payouts.gstPaise,
      tdsPaise: payouts.tdsPaise,
      subConnectorSharePaise: payouts.subConnectorSharePaise,
      netReceivedPaise: payouts.netReceivedPaise,
      receivedDate: payouts.receivedDate,
      disbursalDate: loanFiles.disbursalDate,
      disbursedPaise: loanFiles.disbursedPaise,
    })
    .from(payouts)
    .innerJoin(loanFiles, eq(loanFiles.id, payouts.loanFileId));

  const inMonth = payoutRows.filter((p) => p.disbursalDate && p.disbursalDate >= mStart && p.disbursalDate <= mEnd);
  const pending = payoutRows.filter((p) => p.status !== "received");
  const inFy = payoutRows.filter((p) => p.disbursalDate && p.disbursalDate >= fy.start && p.disbursalDate <= fy.end);

  const [fyDisb] = await db
    .select({ disbursed: sql<string>`coalesce(sum(${loanFiles.disbursedPaise}), 0)`, count: sql<number>`count(*)::int` })
    .from(loanFiles)
    .where(and(gte(loanFiles.disbursalDate, fy.start), lte(loanFiles.disbursalDate, fy.end)));

  const [active] = await db.select({ n: sql<number>`count(*)::int` }).from(loanFiles).where(inArray(loanFiles.stage, ACTIVE_STAGES));

  const fyReceived = payoutRows.filter((p) => p.receivedDate && p.receivedDate >= fy.start && p.receivedDate <= fy.end);

  return {
    monthDisbursed: Number(month.disbursed),
    monthDisbursedCount: Number(month.count),
    monthEarnings: totals(inMonth).gross,
    pendingNet: totals(pending).net,
    pendingCount: pending.length,
    activeCount: Number(active.n),
    fy: {
      label: fy.label,
      disbursed: Number(fyDisb.disbursed),
      disbursedCount: Number(fyDisb.count),
      ...totals(inFy),
      receivedNet: fyReceived.reduce((s, p) => s + (p.netReceivedPaise ?? 0), 0),
      receivedTds: fyReceived.reduce((s, p) => s + p.tdsPaise, 0),
    },
  };
}

/** Funnel over files opened in the last `days` days. */
export async function funnelData(today: string, days = 90) {
  const since = istToInstant(addDays(today, -days));
  const files = await db.select({ id: loanFiles.id, stage: loanFiles.stage }).from(loanFiles).where(gte(loanFiles.createdAt, since));
  const hist = await stageHistories(files.map((f) => f.id));
  return funnel(files.map((f) => ({ stage: f.stage, history: hist.get(f.id) })));
}

/** Per-lender numbers: files, approval rate, disbursed, earnings, speed. */
export async function lenderStats(lenderId?: string) {
  const files = await db
    .select({
      id: loanFiles.id,
      lenderId: loanFiles.lenderId,
      stage: loanFiles.stage,
      disbursedPaise: loanFiles.disbursedPaise,
      loginDate: loanFiles.loginDate,
      disbursalDate: loanFiles.disbursalDate,
    })
    .from(loanFiles)
    .where(lenderId ? eq(loanFiles.lenderId, lenderId) : sql`${loanFiles.lenderId} is not null`);
  const hist = await stageHistories(files.map((f) => f.id));
  const pays = await db
    .select({ lenderId: payouts.lenderId, gross: payouts.grossPaise, status: payouts.status, net: payouts.netReceivedPaise })
    .from(payouts)
    .where(lenderId ? eq(payouts.lenderId, lenderId) : undefined);
  const byLender = new Map<string, typeof files>();
  for (const f of files) byLender.set(f.lenderId!, [...(byLender.get(f.lenderId!) ?? []), f]);
  const out = new Map<string, { files: number; active: number; approval: ReturnType<typeof approvalStats>; disbursed: number; earnings: number; received: number; avgDays: number | null }>();
  for (const [id, list] of byLender) {
    const lp = pays.filter((p) => p.lenderId === id);
    out.set(id, {
      files: list.length,
      active: list.filter((f) => ACTIVE_STAGES.includes(f.stage)).length,
      approval: approvalStats(list.map((f) => ({ stage: f.stage, history: hist.get(f.id) }))),
      disbursed: list.reduce((s, f) => s + (f.disbursedPaise ?? 0), 0),
      earnings: lp.reduce((s, p) => s + p.gross, 0),
      received: lp.reduce((s, p) => s + (p.net ?? 0), 0),
      avgDays: avgLoginToDisbursal(list),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// File detail
// ---------------------------------------------------------------------------

export async function getFileDetail(id: string) {
  const [row] = await db
    .select({ file: loanFiles, borrower: borrowers, lender: lenders, partner: subConnectors })
    .from(loanFiles)
    .innerJoin(borrowers, eq(borrowers.id, loanFiles.borrowerId))
    .leftJoin(lenders, eq(lenders.id, loanFiles.lenderId))
    .leftJoin(subConnectors, eq(subConnectors.id, loanFiles.subConnectorId))
    .where(eq(loanFiles.id, id));
  if (!row) return null;
  const [docs, history, acts, linkedTasks, [payout], otherFiles] = await Promise.all([
    db.select().from(loanDocuments).where(eq(loanDocuments.loanFileId, id)).orderBy(asc(loanDocuments.sort), asc(loanDocuments.name)),
    db.select().from(loanStageHistory).where(eq(loanStageHistory.loanFileId, id)).orderBy(asc(loanStageHistory.at)),
    db.select().from(activities).where(eq(activities.loanFileId, id)).orderBy(desc(activities.at)).limit(50),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.linkedType, "loan_file"), eq(tasks.linkedId, id)))
      .orderBy(asc(tasks.status), asc(tasks.dueDate)),
    db.select().from(payouts).where(eq(payouts.loanFileId, id)),
    db
      .select({ id: loanFiles.id, product: loanFiles.product, stage: loanFiles.stage, amount: loanFiles.amountRequestedPaise })
      .from(loanFiles)
      .where(and(eq(loanFiles.borrowerId, row.borrower.id), sql`${loanFiles.id} <> ${id}`)),
  ]);
  const pendingSince = (await pendingSinceMap([id])).get(id) ?? null;
  return { ...row, docs, history, activities: acts, tasks: linkedTasks, payout: payout ?? null, otherFiles, pendingSince };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export type PayoutRow = Awaited<ReturnType<typeof listPayouts>>[number];

export async function listPayouts(status?: PayoutStatus) {
  return db
    .select({
      payout: payouts,
      fileId: loanFiles.id,
      product: loanFiles.product,
      disbursedPaise: loanFiles.disbursedPaise,
      disbursalDate: loanFiles.disbursalDate,
      applicationNo: loanFiles.applicationNo,
      payoutRateBps: loanFiles.payoutRateBps,
      borrowerName: borrowers.name,
      lenderName: lenders.name,
      partnerName: subConnectors.name,
    })
    .from(payouts)
    .innerJoin(loanFiles, eq(loanFiles.id, payouts.loanFileId))
    .innerJoin(borrowers, eq(borrowers.id, loanFiles.borrowerId))
    .leftJoin(lenders, eq(lenders.id, payouts.lenderId))
    .leftJoin(subConnectors, eq(subConnectors.id, payouts.subConnectorId))
    .where(status ? eq(payouts.status, status) : undefined)
    .orderBy(status === "received" ? desc(payouts.receivedDate) : asc(payouts.expectedDate));
}

// ---------------------------------------------------------------------------
// Borrowers, lenders, partners
// ---------------------------------------------------------------------------

export async function listBorrowers(q?: string | null) {
  const term = q?.trim();
  const where = term
    ? or(ilike(borrowers.name, `%${term}%`), ilike(borrowers.phone, `%${term}%`), ilike(borrowers.city, `%${term}%`), ilike(borrowers.email, `%${term}%`))
    : undefined;
  const rows = await db
    .select({
      borrower: borrowers,
      partnerName: subConnectors.name,
      files: sql<number>`(select count(*)::int from ${loanFiles} where ${loanFiles.borrowerId} = ${borrowers.id})`,
      active: sql<number>`(select count(*)::int from ${loanFiles} where ${loanFiles.borrowerId} = ${borrowers.id} and ${loanFiles.stage} in ('lead','eligibility','documents','logged_in','credit_query','sanctioned','disbursed','payout_invoiced'))`,
      disbursed: sql<string>`(select coalesce(sum(${loanFiles.disbursedPaise}),0) from ${loanFiles} where ${loanFiles.borrowerId} = ${borrowers.id})`,
    })
    .from(borrowers)
    .leftJoin(subConnectors, eq(subConnectors.id, borrowers.subConnectorId))
    .where(where)
    .orderBy(desc(borrowers.updatedAt))
    .limit(300);
  return rows.map((r) => ({ ...r, files: Number(r.files), active: Number(r.active), disbursed: Number(r.disbursed) }));
}

export async function getBorrowerDetail(id: string) {
  const [row] = await db
    .select({ borrower: borrowers, partner: subConnectors })
    .from(borrowers)
    .leftJoin(subConnectors, eq(subConnectors.id, borrowers.subConnectorId))
    .where(eq(borrowers.id, id));
  if (!row) return null;
  const [files, acts] = await Promise.all([
    listFiles(eq(loanFiles.borrowerId, id)),
    db.select().from(activities).where(eq(activities.borrowerId, id)).orderBy(desc(activities.at)).limit(50),
  ]);
  return { ...row, files, activities: acts };
}

export async function listLenders() {
  const rows = await db.select().from(lenders).orderBy(desc(lenders.active), asc(lenders.name));
  const grids = await db.select({ lenderId: payoutRates.lenderId, n: sql<number>`count(*)::int` }).from(payoutRates).groupBy(payoutRates.lenderId);
  const gridCount = new Map(grids.map((g) => [g.lenderId, Number(g.n)]));
  const stats = await lenderStats();
  return rows.map((l) => ({ lender: l, gridRows: gridCount.get(l.id) ?? 0, stats: stats.get(l.id) ?? null }));
}

export async function getLenderDetail(id: string) {
  const [lender] = await db.select().from(lenders).where(eq(lenders.id, id));
  if (!lender) return null;
  const [grid, files, stats] = await Promise.all([
    db.select().from(payoutRates).where(eq(payoutRates.lenderId, id)).orderBy(asc(payoutRates.product), asc(payoutRates.minTicketPaise)),
    listFiles(eq(loanFiles.lenderId, id)),
    lenderStats(id),
  ]);
  return { lender, grid, files, stats: stats.get(id) ?? null };
}

export async function listPartners() {
  const rows = await db.select().from(subConnectors).orderBy(desc(subConnectors.active), asc(subConnectors.name));
  const files = await db
    .select({
      id: loanFiles.id,
      subConnectorId: loanFiles.subConnectorId,
      stage: loanFiles.stage,
      product: loanFiles.product,
      amount: loanFiles.amountRequestedPaise,
      disbursed: loanFiles.disbursedPaise,
      borrowerName: borrowers.name,
    })
    .from(loanFiles)
    .innerJoin(borrowers, eq(borrowers.id, loanFiles.borrowerId))
    .where(sql`${loanFiles.subConnectorId} is not null`)
    .orderBy(desc(loanFiles.updatedAt));
  const pays = await db
    .select({
      id: payouts.id,
      subConnectorId: payouts.subConnectorId,
      share: payouts.subConnectorSharePaise,
      paidDate: payouts.subConnectorPaidDate,
      status: payouts.status,
      borrowerName: borrowers.name,
      fileId: payouts.loanFileId,
    })
    .from(payouts)
    .innerJoin(loanFiles, eq(loanFiles.id, payouts.loanFileId))
    .innerJoin(borrowers, eq(borrowers.id, loanFiles.borrowerId))
    .where(sql`${payouts.subConnectorId} is not null`);
  return rows.map((p) => {
    const mine = pays.filter((x) => x.subConnectorId === p.id);
    return {
      partner: p,
      files: files.filter((f) => f.subConnectorId === p.id),
      earned: mine.reduce((s, x) => s + x.share, 0),
      paid: mine.filter((x) => x.paidDate).reduce((s, x) => s + x.share, 0),
      unpaid: mine.filter((x) => !x.paidDate && x.share > 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export async function earningsRows() {
  return db
    .select({
      disbursalDate: loanFiles.disbursalDate,
      product: loanFiles.product,
      lenderName: lenders.name,
      status: payouts.status,
      grossPaise: payouts.grossPaise,
      gstPaise: payouts.gstPaise,
      tdsPaise: payouts.tdsPaise,
      subConnectorSharePaise: payouts.subConnectorSharePaise,
      netReceivedPaise: payouts.netReceivedPaise,
      receivedDate: payouts.receivedDate,
    })
    .from(payouts)
    .innerJoin(loanFiles, eq(loanFiles.id, payouts.loanFileId))
    .leftJoin(lenders, eq(lenders.id, payouts.lenderId));
}
