import "server-only";
import { and, eq, gte, inArray, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { borrowers, lenders, loanFiles, payouts, type LoanStage, type WorkspaceKey } from "@/db/schema";
import { addDays, diffDays, istToInstant, toISTDate } from "@/lib/dates";
import type { ComingUpItem, NeedsItem } from "./types";

export const CLOSED_STAGES: LoanStage[] = ["payout_received", "rejected", "dropped"];
/** A file whose stage has not moved for longer than this needs a nudge. */
export const STALE_DAYS = 5;

const STAGE_LABEL: Record<LoanStage, string> = {
  lead: "Lead",
  eligibility: "Eligibility",
  documents: "Documents",
  logged_in: "Logged in",
  credit_query: "Credit query",
  sanctioned: "Sanctioned",
  disbursed: "Disbursed",
  payout_invoiced: "Payout invoiced",
  payout_received: "Payout received",
  rejected: "Rejected",
  dropped: "Dropped",
};
const PENDING_LABEL: Record<string, string> = { customer: "customer", me: "you", lender: "lender", valuation_legal: "valuation / legal", none: "" };

/** DSA files only exist in the "dsa" workspace. */
export const dsaVisible = (ws: WorkspaceKey | null) => ws == null || ws === "dsa";

/**
 * Open loan files (not in a closed stage) that either have a follow-up due by today, or are
 * pending with someone and have not changed stage for more than STALE_DAYS days.
 */
export async function loanFilesNeedingYou(ws: WorkspaceKey | null, today: string, now: Date = new Date()): Promise<NeedsItem[]> {
  if (!dsaVisible(ws)) return [];
  const endOfToday = istToInstant(addDays(today, 1));
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 86_400_000);
  const rows = await db
    .select({
      id: loanFiles.id,
      product: loanFiles.product,
      stage: loanFiles.stage,
      stageChangedAt: loanFiles.stageChangedAt,
      pendingWith: loanFiles.pendingWith,
      pendingNote: loanFiles.pendingNote,
      next: loanFiles.nextFollowUpAt,
      borrower: borrowers.name,
      phone: borrowers.phone,
      lender: lenders.name,
      amount: loanFiles.amountRequestedPaise,
    })
    .from(loanFiles)
    .innerJoin(borrowers, eq(borrowers.id, loanFiles.borrowerId))
    .leftJoin(lenders, eq(lenders.id, loanFiles.lenderId))
    .where(
      and(
        notInArray(loanFiles.stage, CLOSED_STAGES),
        or(lt(loanFiles.nextFollowUpAt, endOfToday), and(ne(loanFiles.pendingWith, "none"), lt(loanFiles.stageChangedAt, staleBefore))),
      ),
    )
    .orderBy(sql`${loanFiles.nextFollowUpAt} asc nulls last`, loanFiles.stageChangedAt)
    .limit(100);
  return rows.map((r) => {
    const followDay = r.next ? toISTDate(r.next) : null;
    const followDue = followDay != null && followDay <= today;
    const stuck = diffDays(toISTDate(r.stageChangedAt), today);
    const pending = PENDING_LABEL[r.pendingWith];
    const parts: string[] = [];
    if (followDue) {
      const late = diffDays(followDay!, today);
      parts.push(late > 0 ? `Follow-up was ${late === 1 ? "yesterday" : `${late} days ago`}` : "Follow up today");
    }
    if (pending && stuck > STALE_DAYS) parts.push(`With ${pending} for ${stuck} days`);
    parts.push(STAGE_LABEL[r.stage]);
    if (r.lender) parts.push(r.lender);
    const date = followDue ? followDay : toISTDate(r.stageChangedAt);
    return {
      key: `loan_file:${r.id}`,
      kind: "loan_file" as const,
      id: r.id,
      title: `${r.borrower} · ${r.product.replace(/_/g, " ").replace("lap", "LAP")}`,
      context: parts.join(" · "),
      workspace: "dsa" as const,
      href: `/dsa/files/${r.id}`,
      date,
      overdue: (followDue && followDay! < today) || (!!pending && stuck > STALE_DAYS),
      amountPaise: r.amount,
      phone: r.phone,
    };
  });
}

/** DSA payouts expected (or invoiced) by `to`: net of TDS, plus GST if charged. */
export async function payoutsExpectedTotal(ws: WorkspaceKey | null, to: string) {
  if (!dsaVisible(ws)) return { totalPaise: 0, count: 0 };
  const [r] = await db
    .select({
      total: sql<number>`coalesce(sum(${payouts.grossPaise} + ${payouts.gstPaise} - ${payouts.tdsPaise}), 0)::bigint`,
      n: sql<number>`count(*)::int`,
    })
    .from(payouts)
    .where(and(inArray(payouts.status, ["expected", "invoiced"]), lte(payouts.expectedDate, to)));
  return { totalPaise: Number(r?.total ?? 0), count: r?.n ?? 0 };
}

export async function payoutsComingUp(ws: WorkspaceKey | null, from: string, to: string): Promise<ComingUpItem[]> {
  if (!dsaVisible(ws)) return [];
  const rows = await db
    .select({
      id: payouts.id,
      loanFileId: payouts.loanFileId,
      date: payouts.expectedDate,
      amount: sql<number>`(${payouts.grossPaise} + ${payouts.gstPaise} - ${payouts.tdsPaise})::bigint`,
      lender: lenders.name,
      borrower: borrowers.name,
    })
    .from(payouts)
    .innerJoin(loanFiles, eq(loanFiles.id, payouts.loanFileId))
    .innerJoin(borrowers, eq(borrowers.id, loanFiles.borrowerId))
    .leftJoin(lenders, eq(lenders.id, payouts.lenderId))
    .where(and(inArray(payouts.status, ["expected", "invoiced"]), gte(payouts.expectedDate, from), lte(payouts.expectedDate, to)))
    .orderBy(payouts.expectedDate)
    .limit(40);
  return rows.map((r) => ({
    key: `payout:${r.id}`,
    kind: "payout" as const,
    title: `Payout${r.lender ? ` from ${r.lender}` : ""}`,
    sub: r.borrower,
    href: `/dsa/files/${r.loanFileId}`,
    date: r.date!,
    workspace: "dsa" as const,
    amountPaise: Number(r.amount),
    flow: "in" as const,
  }));
}
