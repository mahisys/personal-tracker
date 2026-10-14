"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/reports", label: "Profit & loss" },
  { href: "/reports/expenses", label: "Expenses" },
  { href: "/reports/receivables", label: "Receivables" },
  { href: "/reports/gst", label: "GST" },
  { href: "/reports/budget", label: "Budget" },
  { href: "/reports/time", label: "Time" },
  { href: "/reports/estimates", label: "Estimates" },
];

export function ReportNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Reports" className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1 pb-1">
      {ITEMS.map((it) => {
        const on = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className={cn("relative inline-flex shrink-0 items-center rounded-full px-4 py-2 text-sm font-semibold transition-colors", on ? "text-bg" : "text-fg-muted hover:bg-brand-soft hover:text-fg")}
          >
            {on ? <motion.span layoutId="report-tab" className="absolute inset-0 rounded-full bg-fg shadow-md" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
            <span className="relative">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** A select that writes its value to a URL search param (FY picker, month, weeks). */
export function ParamSelect({ param, value, options, label }: { param: string; value: string; options: { value: string; label: string }[]; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <label className="relative inline-flex items-center gap-2 text-xs font-semibold text-fg-muted">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          next.set(param, e.target.value);
          start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
        }}
        className="h-9 appearance-none rounded-xl border border-line-strong bg-solid/80 pl-3 pr-8 text-sm font-semibold text-fg shadow-sm transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-fg-subtle">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "▾"}</span>
    </label>
  );
}

/** Pill toggle that writes to a URL search param. */
export function ParamToggle({ param, value, options }: { param: string; value: string; options: { value: string; label: string }[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <div className="inline-flex rounded-xl bg-muted/70 p-1 ring-1 ring-line">
      {options.map((o) => {
        const next = new URLSearchParams(sp.toString());
        next.set(param, o.value);
        const on = o.value === value;
        return (
          <Link key={o.value} href={`${pathname}?${next.toString()}`} scroll={false} className={cn("relative rounded-lg px-3 py-1.5 text-xs font-bold transition-colors", on ? "text-fg" : "text-fg-subtle hover:text-fg")}>
            {on ? <motion.span layoutId={`toggle-${param}`} className="absolute inset-0 rounded-lg bg-solid shadow-sm ring-1 ring-line" transition={{ type: "spring", stiffness: 450, damping: 35 }} /> : null}
            <span className="relative">{o.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
