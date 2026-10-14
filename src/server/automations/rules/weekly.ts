import "server-only";
import { and, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, leadStages, loanFiles, payouts, tasks, timeEntries, transactions, WORKSPACE_KEYS, type WorkspaceKey } from "@/db/schema";
import { addDays, formatDay, formatMinutes, istToInstant, weekday } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";
import { WORKSPACE_META } from "@/lib/workspaces";
import { briefingNotificationBody, renderBriefingEmail, type Briefing, type BriefingItem } from "@/server/messaging/briefing";
import { alertRecipient, sendEmail } from "@/server/messaging/email";
import { appUrl, raiseOnce } from "../helpers";
import { isAtOrAfter, type Rule } from "../types";

export const WEEKLY_REVIEW_TIME = "18:00";

export type WeeklyData = {
  from: string;
  to: string;
  planned: number;
  plannedDone: number;
  completed: number;
  minutesByWorkspace: Record<WorkspaceKey, number>;
  moneyByWorkspace: Record<WorkspaceKey, { inPaise: number; outPaise: number }>;
  leadsCreated: number;
  leadsWon: { count: number; valuePaise: number };
  leadsLost: number;
  disbursals: { count: number; amountPaise: number };
  payoutsReceived: { count: number; amountPaise: number };
};

/** Due on the configured weekday (0 = Sunday) once it is 6 pm IST or later. */
export function isWeeklyReviewDue(today: string, time: string, reviewDay: number): boolean {
  return weekday(today) === reviewDay && isAtOrAfter(time, WEEKLY_REVIEW_TIME);
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Builds the weekly scorecard (pure). */
export function buildWeekly(d: WeeklyData): Briefing {
  const ws = WORKSPACE_KEYS;
  const minutes = ws.reduce((s, k) => s + (d.minutesByWorkspace[k] ?? 0), 0);
  const moneyIn = ws.reduce((s, k) => s + (d.moneyByWorkspace[k]?.inPaise ?? 0), 0);
  const moneyOut = ws.reduce((s, k) => s + (d.moneyByWorkspace[k]?.outPaise ?? 0), 0);
  const rate = pct(d.plannedDone, d.planned);
  const net = moneyIn - moneyOut;

  const hoursItems: BriefingItem[] = ws
    .filter((k) => (d.minutesByWorkspace[k] ?? 0) > 0)
    .map((k) => ({ label: WORKSPACE_META[k].name, meta: `${formatMinutes(d.minutesByWorkspace[k])} · ${pct(d.minutesByWorkspace[k], minutes)}% of tracked time`, href: "/reports/time", tone: "brand" }));
  const moneyItems: BriefingItem[] = ws
    .filter((k) => d.moneyByWorkspace[k] && (d.moneyByWorkspace[k].inPaise || d.moneyByWorkspace[k].outPaise))
    .map((k) => {
      const m = d.moneyByWorkspace[k];
      return {
        label: `${WORKSPACE_META[k].name}: ${m.inPaise - m.outPaise >= 0 ? "+" : "−"}${formatINR(Math.abs(m.inPaise - m.outPaise), { whole: true })}`,
        meta: `In ${formatINR(m.inPaise, { whole: true })} · Out ${formatINR(m.outPaise, { whole: true })}`,
        href: "/books",
        tone: m.inPaise >= m.outPaise ? "good" : "bad",
      };
    });
  const pipeline: BriefingItem[] = [
    { label: `${d.leadsCreated} new lead${d.leadsCreated === 1 ? "" : "s"}`, href: "/crm", tone: "brand" },
    { label: `${d.leadsWon.count} won`, meta: d.leadsWon.count ? `Worth ${formatINR(d.leadsWon.valuePaise, { whole: true })}` : undefined, href: "/crm", tone: "good" },
    { label: `${d.leadsLost} lost`, href: "/crm", tone: d.leadsLost ? "bad" : "neutral" },
  ];
  const dsa: BriefingItem[] = [
    { label: `${d.disbursals.count} disbursal${d.disbursals.count === 1 ? "" : "s"}`, meta: d.disbursals.count ? formatINR(d.disbursals.amountPaise, { whole: true }) : undefined, href: "/dsa", tone: "good" },
    { label: `${d.payoutsReceived.count} payout${d.payoutsReceived.count === 1 ? "" : "s"} received`, meta: d.payoutsReceived.count ? formatINR(d.payoutsReceived.amountPaise, { whole: true }) : undefined, href: "/dsa/payouts", tone: "good" },
  ];
  const cheer =
    rate >= 80 ? "What a week — you finished almost everything you planned." : rate >= 50 ? "Solid week. Carry the rest forward with a fresh start." : "Every week is a reset. Pick your top three for Monday.";
  return {
    kind: "weekly_review",
    title: `Your week in review · ${formatDay(d.from, { short: true })} – ${formatDay(d.to, { short: true })}`,
    subtitle: cheer,
    summary: `${d.plannedDone}/${d.planned} planned tasks done, ${formatMinutes(minutes)} tracked, net ${net >= 0 ? "+" : "−"}${formatINRShort(Math.abs(net))}.`,
    stats: [
      { label: "Planned done", value: `${d.plannedDone}/${d.planned}`, tone: rate >= 80 ? "good" : rate >= 50 ? "warn" : "bad", sub: `${rate}% · ${d.completed} completed in all` },
      { label: "Time tracked", value: formatMinutes(minutes), tone: "brand" },
      { label: "Money in", value: formatINRShort(moneyIn), tone: "good" },
      { label: "Money out", value: formatINRShort(moneyOut), tone: "bad", sub: `net ${net >= 0 ? "+" : "−"}${formatINRShort(Math.abs(net))}` },
    ],
    sections: [
      { heading: "Hours by workspace", items: hoursItems, note: "No time tracked this week." },
      { heading: "Money by workspace", items: moneyItems, note: "No money movements recorded this week." },
      { heading: "Pipeline", items: pipeline },
      { heading: "Loan DSA", items: dsa },
    ],
    footer: "Rest well — next week starts fresh.",
  };
}

/** Loads the last 7 IST days (today included). */
export async function loadWeeklyData(today: string): Promise<WeeklyData> {
  const from = addDays(today, -6);
  const start = istToInstant(from);
  const end = istToInstant(addDays(today, 1));

  const [taskStats] = await db
    .select({
      planned: sql<number>`count(*) filter (where ${tasks.dueDate} between ${from} and ${today} and ${tasks.status} <> 'cancelled')::int`,
      plannedDone: sql<number>`count(*) filter (where ${tasks.dueDate} between ${from} and ${today} and ${tasks.status} = 'done')::int`,
      completed: sql<number>`count(*) filter (where ${tasks.completedAt} >= ${start.toISOString()}::timestamptz and ${tasks.completedAt} < ${end.toISOString()}::timestamptz)::int`,
    })
    .from(tasks);

  const time = await db
    .select({ workspace: tasks.workspace, minutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)::int` })
    .from(timeEntries)
    .innerJoin(tasks, eq(timeEntries.taskId, tasks.id))
    .where(and(gte(timeEntries.startedAt, start), lt(timeEntries.startedAt, end)))
    .groupBy(tasks.workspace);

  const money = await db
    .select({ workspace: transactions.workspace, type: transactions.type, total: sql<number>`coalesce(sum(${transactions.amountPaise}), 0)::bigint` })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, today), ne(transactions.type, "transfer")))
    .groupBy(transactions.workspace, transactions.type);

  const [created] = await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(and(gte(leads.createdAt, start), lt(leads.createdAt, end)));
  const closed = await db
    .select({ kind: leadStages.kind, n: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${leads.valuePaise}), 0)::bigint` })
    .from(leads)
    .innerJoin(leadStages, eq(leads.stageId, leadStages.id))
    .where(and(gte(leads.closedAt, start), lt(leads.closedAt, end), inArray(leadStages.kind, ["won", "lost"])))
    .groupBy(leadStages.kind);

  const [disb] = await db
    .select({ n: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(coalesce(${loanFiles.disbursedPaise}, ${loanFiles.sanctionedPaise}, 0)), 0)::bigint` })
    .from(loanFiles)
    .where(and(gte(loanFiles.disbursalDate, from), lte(loanFiles.disbursalDate, today)));
  const [paid] = await db
    .select({ n: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(coalesce(${payouts.netReceivedPaise}, ${payouts.grossPaise})), 0)::bigint` })
    .from(payouts)
    .where(and(eq(payouts.status, "received"), gte(payouts.receivedDate, from), lte(payouts.receivedDate, today)));

  const minutesByWorkspace = { personal: 0, mahisys: 0, dsa: 0 } as Record<WorkspaceKey, number>;
  for (const t of time) minutesByWorkspace[t.workspace] = Number(t.minutes);
  const moneyByWorkspace = {
    personal: { inPaise: 0, outPaise: 0 },
    mahisys: { inPaise: 0, outPaise: 0 },
    dsa: { inPaise: 0, outPaise: 0 },
  } as WeeklyData["moneyByWorkspace"];
  for (const m of money) {
    if (m.type === "income") moneyByWorkspace[m.workspace].inPaise += Number(m.total);
    else moneyByWorkspace[m.workspace].outPaise += Number(m.total);
  }
  const won = closed.find((c) => c.kind === "won");
  const lost = closed.find((c) => c.kind === "lost");
  return {
    from,
    to: today,
    planned: Number(taskStats?.planned ?? 0),
    plannedDone: Number(taskStats?.plannedDone ?? 0),
    completed: Number(taskStats?.completed ?? 0),
    minutesByWorkspace,
    moneyByWorkspace,
    leadsCreated: Number(created?.n ?? 0),
    leadsWon: { count: Number(won?.n ?? 0), valuePaise: Number(won?.value ?? 0) },
    leadsLost: Number(lost?.n ?? 0),
    disbursals: { count: Number(disb?.n ?? 0), amountPaise: Number(disb?.amount ?? 0) },
    payoutsReceived: { count: Number(paid?.n ?? 0), amountPaise: Number(paid?.amount ?? 0) },
  };
}

export const weeklyReview: Rule = {
  key: "weekly_review",
  async run({ today, time, settings }) {
    const day = Number(settings.notifications.weeklyReviewDay ?? 0);
    if (!isWeeklyReviewDue(today, time, day)) return { notifications: 0, skipped: "Not review time yet" };
    const data = await loadWeeklyData(today);
    const b = buildWeekly(data);
    const raised = await raiseOnce({ kind: "weekly_review", dedupeKey: `weekly_review:${today}`, title: b.title, body: briefingNotificationBody(b), link: "/reports" });
    if (!raised) return { notifications: 0, skipped: "Already sent this week" };
    let emails = 0;
    let note = "Weekly review ready";
    if (settings.notifications.emailEnabled) {
      const r = await sendEmail({ to: alertRecipient(settings.notifications.digestEmail), ...renderBriefingEmail(b, appUrl("/")) });
      if (r.ok) emails = 1;
      else note += r.skipped ? ` · email skipped: ${r.reason}` : ` · email failed: ${r.error}`;
    }
    return { notifications: 1, emails, note };
  },
};
