import Link from "next/link";
import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { BadgeIndianRupee, BellRing, Briefcase, CalendarCheck, Hourglass, KanbanSquare, Landmark, ListTodo, Plus, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { db } from "@/db";
import { payouts } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { Modal } from "@/components/client/modal";
import { AnimatedNumber } from "@/components/client/animated-number";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Section } from "@/components/ui/page";
import { StatTile } from "@/components/ui/stat";
import { LinkButton } from "@/components/ui/button";
import { Board, type BoardCard } from "@/components/dsa/board";
import { DsaNav } from "@/components/dsa/nav";
import { NewFileForm } from "@/components/dsa/new-file-form";
import { ApprovalChart, FunnelChart } from "@/components/dsa/charts";
import { ProductTag, StageBadge } from "@/components/dsa/chips";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMonth, todayIST, toISTDate } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";
import { PENDING_LABELS, PENDING_ORDER } from "@/server/dsa/constants";
import { groupPendency, netOf, stageStaleness } from "@/server/dsa/logic";
import {
  accountOptions,
  activeFiles,
  borrowerOptions,
  dashboardStats,
  docProgress,
  funnelData,
  lenderOptions,
  lenderStats,
  partnerOptions,
  pendingSinceMap,
} from "@/server/dsa/queries";

export const metadata: Metadata = { title: "DSA desk" };

const PENDING_COPY: Record<string, string> = {
  me: "Your move — these are waiting on you",
  customer: "Nudge the customer",
  lender: "Chase the lender / RM",
  valuation_legal: "Valuation or legal reports awaited",
  none: "Nothing pending",
};

export default async function DsaPage({ searchParams }: { searchParams: Promise<{ new?: string; view?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const view = sp.view === "pendency" ? "pendency" : "board";
  const today = todayIST();

  const [files, stats, funnel, lStats, lenders, accounts, partners, borrowers] = await Promise.all([
    activeFiles(),
    dashboardStats(today),
    funnelData(today, 90),
    lenderStats(),
    lenderOptions(true),
    accountOptions(),
    partnerOptions(),
    borrowerOptions(),
  ]);
  const ids = files.map((f) => f.file.id);
  const [docs, pendingSince, filePayouts] = await Promise.all([
    docProgress(ids),
    pendingSinceMap(ids),
    ids.length ? db.select().from(payouts).where(inArray(payouts.loanFileId, ids)) : Promise.resolve([]),
  ]);
  const payoutByFile = new Map(filePayouts.map((p) => [p.loanFileId, p]));
  const activeLenders = lenders.filter((l) => l.active);

  const cards: BoardCard[] = files.map(({ file: f, borrowerName, lenderName }) => {
    const st = stageStaleness(f.stage, f.stageChangedAt, today);
    const p = payoutByFile.get(f.id);
    const d = docs.get(f.id);
    return {
      id: f.id,
      borrowerName,
      lenderId: f.lenderId,
      lenderName,
      applicationNo: f.applicationNo,
      loginDate: f.loginDate,
      amountRequestedPaise: f.amountRequestedPaise,
      sanctionedPaise: f.sanctionedPaise,
      sanctionDate: f.sanctionDate,
      disbursedPaise: f.disbursedPaise,
      disbursalDate: f.disbursalDate,
      payoutNetPaise: p ? netOf(p) : null,
      payoutTdsPaise: p?.tdsPaise ?? null,
      payoutGrossPaise: p?.grossPaise ?? null,
      product: f.product,
      amountPaise: f.disbursedPaise ?? f.sanctionedPaise ?? f.amountRequestedPaise,
      stage: f.stage,
      days: st.days,
      limit: st.limit,
      level: st.level,
      pendingWith: f.pendingWith,
      pendingNote: f.pendingNote,
      docsDone: d?.done ?? 0,
      docsTotal: d?.total ?? 0,
    };
  });

  const stale = cards.filter((c) => c.level !== "fresh").length;
  const followUps = files
    .filter((f) => f.file.nextFollowUpAt && toISTDate(f.file.nextFollowUpAt) <= today)
    .sort((a, b) => a.file.nextFollowUpAt!.getTime() - b.file.nextFollowUpAt!.getTime());

  const approval = lenders
    .map((l) => ({ name: l.name, s: lStats.get(l.id) }))
    .filter((x) => x.s && x.s.approval.decided > 0)
    .map((x) => ({ name: x.name, rate: x.s!.approval.rate ?? 0, approved: x.s!.approval.approved, decided: x.s!.approval.decided }))
    .sort((a, b) => b.rate - a.rate);

  const newFile = (
    <Modal
      trigger={
        <>
          <Plus className="h-4 w-4" /> New file
        </>
      }
      title="New loan file"
      description="Pick the borrower, the product and how much they need."
      defaultOpen={sp.new === "1"}
      wide
    >
      <NewFileForm borrowers={borrowers} lenders={activeLenders} partners={partners} />
    </Modal>
  );

  const pendency = groupPendency(
    files.map((f) => ({ ...f, id: f.file.id, pendingWith: f.file.pendingWith, stageChangedAt: f.file.stageChangedAt, pendingSince: pendingSince.get(f.file.id) ?? null })),
    today,
    PENDING_ORDER,
  ).filter((g) => g.files.length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Loan DSA"
        title="DSA desk"
        description="Every file from first call to payout — who it's waiting on, and what it'll earn you."
        actions={
          <>
            <LinkButton href="/dsa/payouts" variant="secondary">
              <Wallet className="h-4 w-4" /> Payouts
            </LinkButton>
            {newFile}
          </>
        }
      />
      <DsaNav active="/dsa" />

      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={`Disbursed · ${formatMonth(today.slice(0, 7))}`}
          value={<AnimatedNumber value={stats.monthDisbursed} format="inr-short" />}
          sub={stats.monthDisbursedCount ? `${stats.monthDisbursedCount} file${stats.monthDisbursedCount === 1 ? "" : "s"}` : "None yet this month"}
          icon={<Landmark className="h-5 w-5" />}
          tone="warn"
        />
        <StatTile
          label="Earnings this month"
          value={<AnimatedNumber value={stats.monthEarnings} format="inr-short" />}
          sub="Gross payout on this month's disbursals"
          icon={<TrendingUp className="h-5 w-5" />}
          tone="good"
        />
        <StatTile
          label="Payout pending"
          value={<AnimatedNumber value={stats.pendingNet} format="inr-short" />}
          sub={`${stats.pendingCount} expected or invoiced · net`}
          icon={<BadgeIndianRupee className="h-5 w-5" />}
          tone="info"
          href="/dsa/payouts"
        />
        <StatTile
          label="Active files"
          value={<AnimatedNumber value={stats.activeCount} />}
          sub={stale ? <span className="font-semibold text-amber-700 dark:text-amber-300">{stale} running late</span> : "All moving on time"}
          icon={<Briefcase className="h-5 w-5" />}
          tone="brand"
        />
      </div>

      <Card className="mb-8 animate-fade-up overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/14 text-amber-600 dark:text-amber-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-fg-subtle">{stats.fy.label}</div>
              <div className="text-sm font-semibold text-fg">Year so far</div>
            </div>
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[
              ["Disbursed", formatINRShort(stats.fy.disbursed), `${stats.fy.disbursedCount} files`],
              ["Gross earned", formatINRShort(stats.fy.gross), "on FY disbursals"],
              ["Received", formatINRShort(stats.fy.receivedNet), "net in the bank"],
              ["TDS credit", formatINRShort(stats.fy.receivedTds), "claim in your ITR"],
            ].map(([k, v, s]) => (
              <div key={k}>
                <dt className="text-xs text-fg-muted">{k}</dt>
                <dd className="text-lg font-extrabold tabular-nums text-fg">{v}</dd>
                <dd className="text-[11px] text-fg-subtle">{s}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      {followUps.length ? (
        <Card className="mb-6 animate-fade-up border-amber-400/40">
          <CardHeader title="Follow-ups due" description="Pick these up today" icon={<BellRing className="h-4.5 w-4.5" />} />
          <CardBody className="stagger flex gap-2 overflow-x-auto pt-3">
            {followUps.map((f) => (
              <Link key={f.file.id} href={`/dsa/files/${f.file.id}`} className="min-w-[200px] rounded-xl border border-line bg-solid/60 px-3 py-2 transition hover:-translate-y-0.5 hover:shadow-card">
                <div className="truncate text-sm font-bold text-fg">{f.borrowerName}</div>
                <div className="text-xs text-fg-muted">{formatDateTime(f.file.nextFollowUpAt)}</div>
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Section
        title={view === "board" ? "Pipeline" : "Pendency"}
        actions={
          <div className="inline-flex rounded-full bg-muted p-1">
            {(
              [
                ["board", "Board", KanbanSquare],
                ["pendency", "Pendency", Hourglass],
              ] as const
            ).map(([k, label, Icon]) => (
              <Link
                key={k}
                href={k === "board" ? "/dsa" : "/dsa?view=pendency"}
                className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition", view === k ? "bg-solid text-fg shadow-sm" : "text-fg-muted hover:text-fg")}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </Link>
            ))}
          </div>
        }
      >
        {files.length === 0 ? (
          <EmptyState
            icon={<ListTodo className="h-6 w-6" />}
            title="No active files — a clean desk"
            description="Open a file for your next borrower and we'll build the document checklist for you."
            action={<LinkButton href="/dsa?new=1">Open your first file</LinkButton>}
          />
        ) : view === "board" ? (
          <>
            <p className="mb-3 text-xs text-fg-subtle">Drag a card to move it, or tap ⇄ on a card. Amber = over the stage&apos;s time limit, rose = twice over.</p>
            <Board cards={cards} lenders={activeLenders} accounts={accounts} today={today} />
          </>
        ) : (
          <div className="stagger grid gap-4 lg:grid-cols-2">
            {pendency.map((g) => (
              <Card key={g.key}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {g.key === "none" ? "Nothing pending" : `Pending with ${PENDING_LABELS[g.key].toLowerCase()}`}
                      <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-fg-muted">{g.files.length}</span>
                    </span>
                  }
                  description={PENDING_COPY[g.key]}
                  icon={<Hourglass className="h-4.5 w-4.5" />}
                />
                <CardBody className="pt-3">
                  <ul className="divide-y divide-line">
                    {g.files.map((f) => (
                      <li key={f.id}>
                        <Link href={`/dsa/files/${f.id}`} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-3 transition hover:bg-muted/60">
                          <div
                            className={cn(
                              "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center ring-1 ring-inset",
                              f.waiting >= 7 ? "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300" : f.waiting >= 3 ? "bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-300" : "bg-muted text-fg-muted ring-line",
                            )}
                            title={`Waiting ${f.waiting} day${f.waiting === 1 ? "" : "s"}`}
                          >
                            <span className="text-base font-extrabold leading-none tabular-nums">{f.waiting}</span>
                            <span className="text-[9px] font-bold uppercase">days</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm font-bold text-fg">{f.borrowerName}</span>
                              <ProductTag product={f.file.product} short />
                              <span className="text-xs font-semibold tabular-nums text-fg-muted">{formatINRShort(f.file.disbursedPaise ?? f.file.sanctionedPaise ?? f.file.amountRequestedPaise)}</span>
                            </div>
                            <p className={cn("mt-0.5 text-sm", f.file.pendingNote ? "text-fg" : "italic text-fg-subtle")}>{f.file.pendingNote || "No note — open the file to add what&apos;s pending"}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <StageBadge stage={f.file.stage} />
                              {f.lenderName ? <span className="text-xs text-fg-muted">{f.lenderName}</span> : null}
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <div className="stagger grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Funnel" description="Files opened in the last 90 days" icon={<CalendarCheck className="h-4.5 w-4.5" />} />
          <CardBody>
            {funnel[0].count ? (
              <>
                <FunnelChart data={funnel} />
                <p className="mt-2 text-xs text-fg-muted">
                  {funnel[3].pct}% of leads disbursed · {funnel[1].count ? Math.round((funnel[3].count / funnel[1].count) * 100) : 0}% of logins
                </p>
              </>
            ) : (
              <p className="py-10 text-center text-sm text-fg-subtle">Open a few files and your funnel shows up here.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Approval rate by lender" description="Sanctioned ÷ (sanctioned + rejected)" icon={<Landmark className="h-4.5 w-4.5" />} />
          <CardBody>
            {approval.length ? (
              <ApprovalChart data={approval} />
            ) : (
              <p className="py-10 text-center text-sm text-fg-subtle">Once lenders start deciding on files, you&apos;ll see who says yes most.</p>
            )}
          </CardBody>
        </Card>
      </div>
      {stats.fy.gross ? <p className="mt-6 text-center text-xs text-fg-subtle">Net receivable this FY: {formatINR(stats.fy.net, { whole: true })}</p> : null}
    </>
  );
}
