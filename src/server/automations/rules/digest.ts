import "server-only";
import { and, eq, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRules,
  bills,
  borrowers,
  invoices,
  leads,
  leadStages,
  lenders,
  loanFiles,
  payouts,
  tasks,
  type WorkspaceKey,
} from "@/db/schema";
import { addDays, diffDays, formatDateTime, formatDay, istToInstant, relativeDay, toISTTime, weekday } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";
import { WORKSPACE_META } from "@/lib/workspaces";
import { getAccountBalances, liquidBalance } from "@/server/ledger";
import { briefingNotificationBody, renderBriefingEmail, take, type Briefing, type BriefingItem } from "@/server/messaging/briefing";
import { alertRecipient, sendEmail } from "@/server/messaging/email";
import { appUrl, raiseOnce } from "../helpers";
import { DSA_STAGE_LABELS, mergeConfig } from "../meta";
import { isAtOrAfter, normaliseTime, OPEN_TASK_STATUSES, type Rule } from "../types";
import { ACTIVE_LOAN_STAGES, chaseTarget, decideStaleFile, stageLimits } from "./dsa";

export type DigestData = {
  today: string;
  tasksToday: { id: string; title: string; workspace: WorkspaceKey; dueTime: string | null; priority: number }[];
  overdueTasks: { id: string; title: string; workspace: WorkspaceKey; dueDate: string }[];
  followUps: { type: "lead" | "loan_file"; id: string; title: string; at: Date }[];
  bills: { id: string; title: string; payee: string | null; amountPaise: number; dueDate: string }[];
  dsaChase: { id: string; borrower: string; stage: string; days: number; who: string }[];
  overdueInvoices: { id: string; number: string; client: string; balancePaise: number; dueDate: string }[];
  liquidPaise: number;
  minBalancePaise: number;
  inThisWeekPaise: number;
  outThisWeekPaise: number;
};

/** The digest is due once the IST clock reaches the configured digest time (default 08:00). */
export function isDigestDue(time: string, digestTime: string): boolean {
  return isAtOrAfter(time, normaliseTime(digestTime));
}

const GREETINGS = ["Good morning", "Rise and shine", "Morning", "Hello, sunshine"];

/** Builds the morning briefing (pure). */
export function buildDigest(d: DigestData): Briefing {
  const wd = weekday(d.today);
  const greeting = GREETINGS[wd % GREETINGS.length];
  const taskItems: BriefingItem[] = [
    ...d.overdueTasks.map((t) => ({
      label: t.title,
      meta: `Overdue · was due ${relativeDay(t.dueDate, d.today).toLowerCase()} · ${WORKSPACE_META[t.workspace].short}`,
      href: `/tasks/${t.id}`,
      tone: "bad" as const,
    })),
    ...[...d.tasksToday]
      .sort((a, b) => a.priority - b.priority || (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99"))
      .map((t) => ({
        label: t.title,
        meta: `${t.dueTime ? `At ${t.dueTime} · ` : ""}P${t.priority} · ${WORKSPACE_META[t.workspace].short}`,
        href: `/tasks/${t.id}`,
        tone: (t.priority <= 1 ? "warn" : "brand") as "warn" | "brand",
      })),
  ];
  const followItems: BriefingItem[] = [...d.followUps]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((f) => ({
      label: f.title,
      meta: `${f.type === "lead" ? "Lead" : "Loan file"} · ${formatDateTime(f.at)}`,
      href: f.type === "lead" ? `/crm/leads/${f.id}` : `/dsa/files/${f.id}`,
      tone: "warn" as const,
    }));
  const billItems: BriefingItem[] = [...d.bills]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((b) => {
      const n = diffDays(d.today, b.dueDate);
      return {
        label: `${formatINR(b.amountPaise)} · ${b.payee || b.title}`,
        meta: n < 0 ? `Overdue by ${-n} day${n === -1 ? "" : "s"}` : `Due ${relativeDay(b.dueDate, d.today).toLowerCase()} (${formatDay(b.dueDate, { short: true })})`,
        href: `/planner/bills/${b.id}`,
        tone: (n < 0 ? "bad" : n === 0 ? "warn" : "neutral") as "bad" | "warn" | "neutral",
      };
    });
  const dsaItems: BriefingItem[] = [...d.dsaChase]
    .sort((a, b) => b.days - a.days)
    .map((f) => ({ label: `${f.borrower} — ${f.stage}`, meta: `${f.days} days in stage · chase ${f.who}`, href: `/dsa/files/${f.id}`, tone: "warn" as const }));
  const invItems: BriefingItem[] = [...d.overdueInvoices]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((i) => ({
      label: `${i.number} · ${i.client}`,
      meta: `${formatINR(i.balancePaise)} · ${diffDays(i.dueDate, d.today)} days overdue`,
      href: `/invoices/${i.id}`,
      tone: "bad" as const,
    }));

  const counts = {
    tasks: d.tasksToday.length + d.overdueTasks.length,
    follow: d.followUps.length,
    bills: d.bills.length,
  };
  const overdueReceivable = d.overdueInvoices.reduce((s, i) => s + i.balancePaise, 0);
  const lowCash = d.liquidPaise < d.minBalancePaise;

  const bits: string[] = [];
  if (counts.tasks) bits.push(`${counts.tasks} task${counts.tasks === 1 ? "" : "s"}`);
  if (counts.follow) bits.push(`${counts.follow} follow-up${counts.follow === 1 ? "" : "s"}`);
  if (counts.bills) bits.push(`${counts.bills} bill${counts.bills === 1 ? "" : "s"} due soon`);
  if (d.dsaChase.length) bits.push(`${d.dsaChase.length} file${d.dsaChase.length === 1 ? "" : "s"} to chase`);
  if (d.overdueInvoices.length) bits.push(`${formatINRShort(overdueReceivable)} overdue to collect`);
  const summary = bits.length ? `Today: ${bits.join(", ")}. Cash ${formatINRShort(d.liquidPaise)}.` : `A clear day ahead. Cash ${formatINRShort(d.liquidPaise)}.`;

  return {
    kind: "digest",
    title: `${greeting} — your ${formatDay(d.today, { short: true })} briefing`,
    subtitle: bits.length ? `Here's what needs you today. One thing at a time.` : "Nothing urgent today — a great day to get ahead.",
    summary,
    stats: [
      { label: "Tasks today", value: String(counts.tasks), tone: d.overdueTasks.length ? "bad" : "brand", sub: d.overdueTasks.length ? `${d.overdueTasks.length} overdue` : "none overdue" },
      { label: "Cash on hand", value: formatINRShort(d.liquidPaise), tone: lowCash ? "bad" : "good", sub: lowCash ? `below ${formatINRShort(d.minBalancePaise)} minimum` : "bank + cash + UPI" },
      { label: "Due in this week", value: formatINRShort(d.inThisWeekPaise), tone: "good", sub: "invoices + payouts" },
      { label: "Due out this week", value: formatINRShort(d.outThisWeekPaise), tone: d.outThisWeekPaise > d.liquidPaise ? "bad" : "warn", sub: "bills & EMIs" },
    ],
    sections: [
      { heading: "Tasks", ...take(taskItems, 8), href: "/tasks", note: "No tasks due — enjoy the space." },
      { heading: "Follow-ups due", ...take(followItems, 6), href: "/crm", note: "No follow-ups due today." },
      { heading: "Bills in the next 3 days", ...take(billItems, 6), href: "/planner", note: "No bills due in the next 3 days." },
      { heading: "DSA files to chase", ...take(dsaItems, 6), href: "/dsa", note: "Every file is moving on time." },
      { heading: "Overdue invoices", ...take(invItems, 6), href: "/invoices", note: "Every invoice is on time." },
    ],
    footer: bits.length ? "You've got this. Small steps, steady progress." : "All caught up — enjoy your day.",
  };
}

/** Loads everything the digest needs. */
export async function loadDigestData(today: string, minBalancePaise: number): Promise<DigestData> {
  const tomorrowStart = istToInstant(addDays(today, 1));
  const weekEnd = addDays(today, 6);

  const openTasks = await db
    .select({ id: tasks.id, title: tasks.title, workspace: tasks.workspace, dueDate: tasks.dueDate, dueTime: tasks.dueTime, priority: tasks.priority })
    .from(tasks)
    .where(and(inArray(tasks.status, [...OPEN_TASK_STATUSES]), lte(tasks.dueDate, today)));

  const leadFollow = await db
    .select({ id: leads.id, title: leads.title, at: leads.nextFollowUpAt })
    .from(leads)
    .innerJoin(leadStages, eq(leads.stageId, leadStages.id))
    .where(and(eq(leadStages.kind, "open"), isNotNull(leads.nextFollowUpAt), lt(leads.nextFollowUpAt, tomorrowStart)));

  const fileRows = await db
    .select({
      id: loanFiles.id,
      stage: loanFiles.stage,
      stageChangedAt: loanFiles.stageChangedAt,
      pendingWith: loanFiles.pendingWith,
      nextFollowUpAt: loanFiles.nextFollowUpAt,
      borrowerName: borrowers.name,
      lenderName: lenders.name,
      rmName: lenders.rmName,
    })
    .from(loanFiles)
    .innerJoin(borrowers, eq(loanFiles.borrowerId, borrowers.id))
    .leftJoin(lenders, eq(loanFiles.lenderId, lenders.id))
    .where(inArray(loanFiles.stage, ACTIVE_LOAN_STAGES));

  const [dsaRule] = await db.select().from(automationRules).where(eq(automationRules.key, "dsa_stale_files"));
  const limits = stageLimits(mergeConfig("dsa_stale_files", dsaRule?.config));
  const dsaChase: DigestData["dsaChase"] = [];
  const fileFollow: DigestData["followUps"] = [];
  for (const f of fileRows) {
    const s = decideStaleFile(f, today, limits);
    if (s) dsaChase.push({ id: f.id, borrower: f.borrowerName, stage: DSA_STAGE_LABELS[f.stage] ?? f.stage, days: s.days, who: chaseTarget(f) });
    if (f.nextFollowUpAt && f.nextFollowUpAt < tomorrowStart) fileFollow.push({ type: "loan_file", id: f.id, title: `${f.borrowerName} — ${DSA_STAGE_LABELS[f.stage] ?? f.stage}`, at: f.nextFollowUpAt });
  }

  const billRows = await db
    .select({ id: bills.id, title: bills.title, payee: bills.payee, amountPaise: bills.amountPaise, dueDate: bills.dueDate })
    .from(bills)
    .where(and(eq(bills.status, "upcoming"), lte(bills.dueDate, weekEnd)));

  const invRows = await db
    .select({ id: invoices.id, number: invoices.number, billTo: invoices.billTo, totalPaise: invoices.totalPaise, paidPaise: invoices.paidPaise, dueDate: invoices.dueDate })
    .from(invoices)
    .where(and(inArray(invoices.status, ["sent", "part_paid"]), lte(invoices.dueDate, weekEnd)));

  const payoutRows = await db
    .select({ grossPaise: payouts.grossPaise, tdsPaise: payouts.tdsPaise, expectedDate: payouts.expectedDate })
    .from(payouts)
    .where(and(inArray(payouts.status, ["expected", "invoiced"]), isNotNull(payouts.expectedDate), lte(payouts.expectedDate, weekEnd)));

  const balances = await getAccountBalances(today);

  const inThisWeek =
    invRows.filter((i) => i.dueDate >= today).reduce((s, i) => s + Math.max(0, i.totalPaise - i.paidPaise), 0) +
    payoutRows.filter((p) => p.expectedDate! >= today).reduce((s, p) => s + p.grossPaise - p.tdsPaise, 0);
  const outThisWeek = billRows.reduce((s, b) => s + b.amountPaise, 0);

  return {
    today,
    tasksToday: openTasks.filter((t) => t.dueDate === today),
    overdueTasks: openTasks.filter((t) => t.dueDate! < today).map((t) => ({ ...t, dueDate: t.dueDate! })),
    followUps: [...leadFollow.map((l) => ({ type: "lead" as const, id: l.id, title: l.title, at: l.at! })), ...fileFollow],
    bills: billRows.filter((b) => b.dueDate <= addDays(today, 3)),
    dsaChase,
    overdueInvoices: invRows
      .filter((i) => i.dueDate < today && i.totalPaise - i.paidPaise > 0)
      .map((i) => ({ id: i.id, number: i.number, client: i.billTo.name, balancePaise: i.totalPaise - i.paidPaise, dueDate: i.dueDate })),
    liquidPaise: liquidBalance(balances),
    minBalancePaise,
    inThisWeekPaise: inThisWeek,
    outThisWeekPaise: outThisWeek,
  };
}

export const dailyDigest: Rule = {
  key: "daily_digest",
  async run({ today, time, settings, trigger }) {
    const digestTime = normaliseTime(settings.notifications.digestTime);
    if (!isDigestDue(time, digestTime)) return { notifications: 0, skipped: `Waiting for ${digestTime} IST` };
    const data = await loadDigestData(today, settings.finance.minBalancePaise);
    const b = buildDigest(data);
    const raised = await raiseOnce({ kind: "digest", dedupeKey: `digest:${today}`, title: b.title, body: briefingNotificationBody(b), link: "/" });
    if (!raised) return { notifications: 0, skipped: "Already sent today" };
    let emails = 0;
    let note = `Digest ready at ${toISTTime(new Date())} IST (${trigger})`;
    if (settings.notifications.emailEnabled) {
      const mail = renderBriefingEmail(b, appUrl("/"));
      const r = await sendEmail({ to: alertRecipient(settings.notifications.digestEmail), ...mail });
      if (r.ok) emails = 1;
      else note += r.skipped ? ` · email skipped: ${r.reason}` : ` · email failed: ${r.error}`;
    }
    return { notifications: 1, emails, note };
  },
};
