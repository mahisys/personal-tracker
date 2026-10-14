import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { borrowers, lenders, loanFiles, payouts, type LoanStage, type PayoutStatus, type PendingWith } from "@/db/schema";
import { addDays, diffDays, formatDay, toISTDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { hasOpenLinkedTask, raiseWithTask } from "../helpers";
import { DSA_STAGE_LABELS, DSA_STAGE_LIMIT_DEFAULTS, numConfig } from "../meta";
import { weekStart, type Rule } from "../types";

export const ACTIVE_LOAN_STAGES = Object.keys(DSA_STAGE_LIMIT_DEFAULTS) as LoanStage[];

/** Stage limits from config merged over defaults; invalid values fall back to the default. */
export function stageLimits(config: Record<string, unknown>): Record<string, number> {
  const stored = (config.stageLimits ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [s, def] of Object.entries(DSA_STAGE_LIMIT_DEFAULTS)) out[s] = numConfig(stored, s, def, 1, 365);
  return out;
}

/** Days a file has been in its current stage (IST days) when that exceeds the stage limit, else null. */
export function decideStaleFile(file: { stage: LoanStage; stageChangedAt: Date }, today: string, limits: Record<string, number>): { days: number; limit: number } | null {
  const limit = limits[file.stage];
  if (limit == null) return null;
  const days = diffDays(toISTDate(file.stageChangedAt), today);
  return days > limit ? { days, limit } : null;
}

/** Who to chase: the lender RM when the file is with the lender, otherwise the borrower. */
export function chaseTarget(f: { pendingWith: PendingWith; borrowerName: string; lenderName: string | null; rmName: string | null }): string {
  if ((f.pendingWith === "lender" || f.pendingWith === "valuation_legal") && (f.rmName || f.lenderName)) {
    return f.rmName ? `${f.rmName}${f.lenderName ? ` (${f.lenderName})` : ""}` : f.lenderName!;
  }
  return f.borrowerName;
}

export const dsaStaleFiles: Rule = {
  key: "dsa_stale_files",
  async run({ today, config }) {
    const limits = stageLimits(config);
    const rows = await db
      .select({
        id: loanFiles.id,
        stage: loanFiles.stage,
        stageChangedAt: loanFiles.stageChangedAt,
        pendingWith: loanFiles.pendingWith,
        pendingNote: loanFiles.pendingNote,
        borrowerName: borrowers.name,
        lenderName: lenders.name,
        rmName: lenders.rmName,
        rmPhone: lenders.rmPhone,
      })
      .from(loanFiles)
      .innerJoin(borrowers, eq(loanFiles.borrowerId, borrowers.id))
      .leftJoin(lenders, eq(loanFiles.lenderId, lenders.id))
      .where(inArray(loanFiles.stage, ACTIVE_LOAN_STAGES));
    let n = 0;
    let t = 0;
    for (const f of rows) {
      const d = decideStaleFile(f, today, limits);
      if (!d) continue;
      if (await hasOpenLinkedTask("loan_file", f.id)) continue;
      const stage = DSA_STAGE_LABELS[f.stage] ?? f.stage;
      const who = chaseTarget(f);
      const res = await raiseWithTask(
        {
          kind: "dsa_stale",
          dedupeKey: `dsa_stale:${f.id}:${today}`,
          title: `${f.borrowerName}'s file is stuck in ${stage}`,
          body: `${d.days} days in ${stage} (usual limit ${d.limit}). Added a task to chase ${who}.`,
          link: `/dsa/files/${f.id}`,
          workspace: "dsa",
        },
        {
          workspace: "dsa",
          title: `Chase ${who}: ${f.borrowerName} — ${stage}`,
          description: [
            `${d.days} days in ${stage}; usual limit is ${d.limit}.`,
            f.pendingNote ? `Pending: ${f.pendingNote}` : "",
            f.rmPhone && who !== f.borrowerName ? `RM phone: ${f.rmPhone}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          dueDate: today,
          priority: 2,
          linkedType: "loan_file",
          linkedId: f.id,
          taskType: "follow-up",
        },
      );
      if (res.raised) n++;
      if (res.taskId) t++;
    }
    return { notifications: n, tasks: t, note: `${rows.length} active files checked` };
  },
};

/** When a payout is late: the date it was due and days late, else null. */
export function decidePayoutChase(
  p: { status: PayoutStatus; expectedDate: string | null; disbursalDate: string | null },
  today: string,
  graceDays = 30,
): { dueDate: string; daysLate: number } | null {
  if (p.status !== "expected" && p.status !== "invoiced") return null;
  const dueDate = p.expectedDate ?? (p.disbursalDate ? addDays(p.disbursalDate, graceDays) : null);
  if (!dueDate) return null;
  const daysLate = diffDays(dueDate, today);
  return daysLate > 0 ? { dueDate, daysLate } : null;
}

export const payoutChase: Rule = {
  key: "payout_chase",
  async run({ today, config }) {
    const grace = numConfig(config, "graceDays", 30, 1, 365);
    const rows = await db
      .select({
        id: payouts.id,
        loanFileId: payouts.loanFileId,
        status: payouts.status,
        expectedDate: payouts.expectedDate,
        grossPaise: payouts.grossPaise,
        invoiceNo: payouts.invoiceNo,
        disbursalDate: loanFiles.disbursalDate,
        borrowerName: borrowers.name,
        lenderName: lenders.name,
        rmName: lenders.rmName,
        rmPhone: lenders.rmPhone,
      })
      .from(payouts)
      .innerJoin(loanFiles, eq(payouts.loanFileId, loanFiles.id))
      .innerJoin(borrowers, eq(loanFiles.borrowerId, borrowers.id))
      .leftJoin(lenders, eq(payouts.lenderId, lenders.id))
      .where(inArray(payouts.status, ["expected", "invoiced"]));
    let n = 0;
    let t = 0;
    for (const p of rows) {
      const d = decidePayoutChase(p, today, grace);
      if (!d) continue;
      if (await hasOpenLinkedTask("loan_file", p.loanFileId, "Chase payout")) continue;
      const lender = p.lenderName ?? "lender";
      const res = await raiseWithTask(
        {
          kind: "payout_chase",
          dedupeKey: `payout_chase:${p.id}:${weekStart(today)}`,
          title: `Payout of ${formatINR(p.grossPaise)} from ${lender} is late`,
          body: `${p.borrowerName}'s payout was expected ${formatDay(d.dueDate)} — ${d.daysLate} days ago. Added a chase task.`,
          link: `/dsa/files/${p.loanFileId}`,
          workspace: "dsa",
        },
        {
          workspace: "dsa",
          title: `Chase payout: ${lender} — ${p.borrowerName}`,
          description: [
            `${formatINR(p.grossPaise)} expected ${formatDay(d.dueDate)}.`,
            p.invoiceNo ? `Payout invoice ${p.invoiceNo}.` : "Payout invoice not raised yet.",
            p.rmName ? `RM: ${p.rmName}${p.rmPhone ? ` · ${p.rmPhone}` : ""}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          dueDate: today,
          priority: 2,
          linkedType: "loan_file",
          linkedId: p.loanFileId,
          taskType: "follow-up",
        },
      );
      if (res.raised) n++;
      if (res.taskId) t++;
    }
    return { notifications: n, tasks: t, note: `${rows.length} pending payouts checked` };
  },
};
