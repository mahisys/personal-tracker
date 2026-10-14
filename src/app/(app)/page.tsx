import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, ChevronRight, Hourglass, Wallet } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { getTodayData } from "@/server/today";
import { getRunningTimer } from "@/server/tasks/queries";
import { AnimatedNumber } from "@/components/client/animated-number";
import { Section } from "@/components/ui/page";
import { StatTile } from "@/components/ui/stat";
import { OverrunPrompt } from "@/components/tasks/overrun-prompt";
import { RunningTimerPill } from "@/components/tasks/timer";
import { AllCaughtUp } from "@/components/today/all-caught-up";
import { ComingUp } from "@/components/today/coming-up";
import { greetingFor, plateLine } from "@/components/today/greeting";
import { TodayHero } from "@/components/today/hero";
import { NeedsYou } from "@/components/today/needs-you";
import { formatMinutes, toISTTime } from "@/lib/dates";
import { WORKSPACE_META } from "@/lib/workspaces";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  await requireUser();
  const ws = await getWorkspaceFilter();
  const now = new Date();
  const [{ today, needs, stats, comingUp }, running] = await Promise.all([getTodayData(ws, now), getRunningTimer()]);

  const hour = Number(toISTTime(now).slice(0, 2));
  const g = greetingFor(hour);
  const overdue = needs.filter((n) => n.overdue).length;
  const line = plateLine({ needs: needs.length, overdue, doneToday: stats.progress.done, openToday: stats.progress.open });

  const { plannedMinutes, availableMinutes, unestimated, isWorkday } = stats.hours;
  const overbooked = plannedMinutes > availableMinutes;
  const billsN = stats.billsDue.count;
  const inParts = [
    stats.expectedIn.invoices.count ? `${stats.expectedIn.invoices.count} invoice${stats.expectedIn.invoices.count === 1 ? "" : "s"}` : null,
    stats.expectedIn.payouts.count ? `${stats.expectedIn.payouts.count} payout${stats.expectedIn.payouts.count === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <>
      <TodayHero greeting={g.text} emoji={g.emoji} today={today} line={line} progress={stats.progress} streak={stats.streak} />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4 stagger">
        <StatTile
          label="Cash in hand"
          value={<AnimatedNumber value={stats.cashPaise} format="inr-short" />}
          sub={ws ? `${WORKSPACE_META[ws].short} + shared accounts` : "Bank, cash, UPI & wallets"}
          icon={<Wallet className="h-5 w-5" />}
          tone="brand"
          href="/books/accounts"
        />
        <StatTile
          label="Due this week"
          value={<AnimatedNumber value={stats.billsDue.totalPaise} format="inr-short" />}
          sub={billsN ? `${billsN} payment${billsN === 1 ? "" : "s"} in the next 7 days` : "No bills due — nice"}
          icon={<ArrowUpCircle className="h-5 w-5" />}
          tone={billsN ? "bad" : "good"}
          href="/planner"
        />
        <StatTile
          label="Expected this week"
          value={<AnimatedNumber value={stats.expectedIn.totalPaise} format="inr-short" />}
          sub={inParts.length ? inParts.join(" · ") : "Nothing expected yet"}
          icon={<ArrowDownCircle className="h-5 w-5" />}
          tone="good"
          href="/invoices"
        />
        <StatTile
          label="Hours planned today"
          value={
            <span>
              {formatMinutes(plannedMinutes || 0)}
              <span className="text-base font-bold text-fg-subtle"> / {formatMinutes(availableMinutes)}</span>
            </span>
          }
          sub={
            !isWorkday
              ? "Day off — rest is productive too"
              : overbooked
                ? `${formatMinutes(plannedMinutes - availableMinutes)} over — snooze something?`
                : unestimated
                  ? `${unestimated} task${unestimated === 1 ? "" : "s"} without an estimate`
                  : plannedMinutes
                    ? `${formatMinutes(availableMinutes - plannedMinutes)} of breathing room`
                    : "A wide-open day"
          }
          icon={<Hourglass className="h-5 w-5" />}
          tone={overbooked ? "warn" : "info"}
          href="/tasks"
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Section
            title={
              <span className="inline-flex items-center gap-2">
                Needs you
                {needs.length ? <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] tabular-nums text-brand">{needs.length}</span> : null}
                {overdue ? <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] normal-case tracking-normal text-rose-600 dark:text-rose-300">{overdue} overdue</span> : null}
              </span>
            }
            actions={
              <Link href="/tasks" className="inline-flex items-center gap-0.5 text-xs font-bold text-brand hover:underline">
                All tasks <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {needs.length ? <NeedsYou items={needs} /> : <AllCaughtUp doneToday={stats.progress.done} />}
          </Section>
        </div>
        <div className="lg:col-span-2">
          <Section title="Coming up">
            <ComingUp days={comingUp} today={today} />
          </Section>
        </div>
      </div>

      <OverrunPrompt />
      <RunningTimerPill timer={running} />
    </>
  );
}
