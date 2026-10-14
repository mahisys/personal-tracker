import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Tone } from "./badge";

const toneBg: Record<Tone, string> = {
  neutral: "from-slate-400/15",
  brand: "from-violet-500/18",
  good: "from-emerald-500/18",
  warn: "from-amber-500/20",
  bad: "from-rose-500/18",
  info: "from-sky-500/18",
  violet: "from-fuchsia-500/16",
};
const toneIcon: Record<Tone, string> = {
  neutral: "text-fg-muted bg-muted",
  brand: "text-brand bg-brand-soft",
  good: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-300",
  warn: "text-amber-600 bg-amber-500/14 dark:text-amber-300",
  bad: "text-rose-600 bg-rose-500/12 dark:text-rose-300",
  info: "text-sky-600 bg-sky-500/12 dark:text-sky-300",
  violet: "text-fuchsia-600 bg-fuchsia-500/12 dark:text-fuchsia-300",
};

/** KPI tile: a label, a big number, an optional sub-line and trend. */
export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = "brand",
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  href?: string;
  className?: string;
}) {
  const inner = (
    <>
      <div className={cn("pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br to-transparent blur-2xl", toneBg[tone])} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-fg-muted">{label}</div>
          <div className="mt-1.5 break-words text-[20px] leading-tight font-extrabold tracking-tight tabular-nums text-fg sm:text-2xl">{value}</div>
          {sub ? <div className="mt-1 text-xs text-fg-muted">{sub}</div> : null}
        </div>
        {icon ? <div className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl min-[420px]:flex", toneIcon[tone])}>{icon}</div> : null}
      </div>
    </>
  );
  const cls = cn(
    "glass relative block overflow-hidden rounded-[var(--radius-card)] border border-line p-4 shadow-card transition-all duration-300 sm:p-5",
    href && "hover:-translate-y-0.5 hover:shadow-pop",
    className,
  );
  return href ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Thin progress bar, 0–100. */
export function Progress({ value, tone = "brand", className }: { value: number; tone?: "brand" | "good" | "warn" | "bad"; className?: string }) {
  const fill = {
    brand: "bg-[linear-gradient(90deg,var(--brand),var(--brand-2))]",
    good: "bg-[linear-gradient(90deg,#10b981,#22c1a3)]",
    warn: "bg-[linear-gradient(90deg,#f59e0b,#fbbf24)]",
    bad: "bg-[linear-gradient(90deg,#f43f5e,#fb7185)]",
  }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fill)} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Circular progress ring with a label in the middle. */
export function ProgressRing({ value, size = 72, stroke = 8, label, sub }: { value: number; size?: number; stroke?: number; label?: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const gid = `ring-${size}-${stroke}`;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="#22c1a3" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--bg-muted)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-sm font-extrabold tabular-nums text-fg">{label ?? `${Math.round(v)}%`}</div>
        {sub ? <div className="text-[10px] font-semibold text-fg-subtle">{sub}</div> : null}
      </div>
    </div>
  );
}
