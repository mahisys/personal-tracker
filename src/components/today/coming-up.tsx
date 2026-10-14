import Link from "next/link";
import { CalendarRange } from "lucide-react";
import type { ComingUpItem, ComingUpKind } from "@/server/today/types";
import { formatINRShort } from "@/lib/money";
import { cn } from "@/lib/cn";
import { dayHeading } from "./greeting";

const DOT: Record<ComingUpKind, string> = {
  task: "bg-violet-500",
  bill: "bg-rose-500",
  invoice: "bg-emerald-500",
  payout: "bg-amber-500",
  lead: "bg-indigo-500",
  renewal: "bg-sky-500",
};

/** The next seven days as a compact timeline. */
export function ComingUp({ days, today }: { days: { date: string; items: ComingUpItem[] }[]; today: string }) {
  if (days.length === 0) {
    return (
      <div className="glass flex items-center gap-3 rounded-[var(--radius-card)] border border-line p-5 text-sm text-fg-muted shadow-card">
        <CalendarRange className="h-5 w-5 text-brand" />A quiet week ahead — nothing scheduled for the next 7 days.
      </div>
    );
  }
  return (
    <div className="glass rounded-[var(--radius-card)] border border-line p-5 shadow-card">
      <ol className="relative space-y-5 stagger">
        {days.map((d) => {
          const h = dayHeading(d.date, today);
          const moneyIn = d.items.filter((i) => i.flow === "in").reduce((s, i) => s + (i.amountPaise ?? 0), 0);
          const moneyOut = d.items.filter((i) => i.flow === "out").reduce((s, i) => s + (i.amountPaise ?? 0), 0);
          return (
            <li key={d.date} className="relative grid grid-cols-[4.5rem_1fr] gap-3">
              <div className="pt-0.5">
                <div className="text-sm font-extrabold text-fg">{h.title}</div>
                <div className="text-[11px] font-semibold text-fg-subtle">{h.sub}</div>
              </div>
              <div className="min-w-0 border-l border-line-strong pl-4">
                {moneyIn || moneyOut ? (
                  <div className="mb-1.5 flex flex-wrap gap-2 text-[11px] font-bold tabular-nums">
                    {moneyIn ? <span className="text-emerald-600 dark:text-emerald-300">+{formatINRShort(moneyIn)} in</span> : null}
                    {moneyOut ? <span className="text-rose-600 dark:text-rose-300">−{formatINRShort(moneyOut)} out</span> : null}
                  </div>
                ) : null}
                <ul className="space-y-1">
                  {d.items.map((i) => (
                    <li key={i.key}>
                      <Link href={i.href} className="group -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1 transition hover:bg-brand-soft">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[i.kind])} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg group-hover:text-brand">
                          {i.title}
                          {i.sub ? <span className="text-fg-subtle"> · {i.sub}</span> : null}
                        </span>
                        {i.amountPaise ? (
                          <span className={cn("shrink-0 text-xs font-bold tabular-nums", i.flow === "in" ? "text-emerald-600 dark:text-emerald-300" : "text-fg-muted")}>
                            {formatINRShort(i.amountPaise)}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
