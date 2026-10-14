import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "brand" | "good" | "warn" | "bad" | "info" | "violet";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-fg-muted ring-line-strong",
  brand: "bg-brand-soft text-brand ring-brand/20",
  good: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  warn: "bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-300",
  bad: "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  info: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  violet: "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
