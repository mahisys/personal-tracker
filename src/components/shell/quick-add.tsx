"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CheckSquare, FileText, IndianRupee, Landmark, Receipt, UserPlus, CalendarClock } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

/** Each module page opens its "new" dialog when visited with ?new=1 */
const ITEMS = [
  { href: "/tasks?new=1", label: "Task", hint: "Something to do", icon: CheckSquare, color: "text-violet-500 bg-violet-500/10" },
  { href: "/crm?new=1", label: "Lead", hint: "MahiSys sales lead", icon: UserPlus, color: "text-indigo-500 bg-indigo-500/10" },
  { href: "/dsa?new=1", label: "Loan file", hint: "DSA borrower", icon: Landmark, color: "text-amber-500 bg-amber-500/10" },
  { href: "/books?new=expense", label: "Expense", hint: "Money out", icon: Receipt, color: "text-rose-500 bg-rose-500/10" },
  { href: "/books?new=income", label: "Income", hint: "Money in", icon: IndianRupee, color: "text-emerald-500 bg-emerald-500/10" },
  { href: "/planner?new=1", label: "Bill / payment", hint: "Due on a date", icon: CalendarClock, color: "text-sky-500 bg-sky-500/10" },
  { href: "/invoices/new", label: "Invoice", hint: "Bill a client", icon: FileText, color: "text-fuchsia-500 bg-fuchsia-500/10" },
];

export function QuickAdd({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <div ref={ref} className="relative ml-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className={buttonClass("primary", "md", "h-9 rounded-xl px-3")}>
        {children}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-line bg-solid p-2 shadow-pop"
          >
            <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-fg-subtle">Quick add · Ctrl K</div>
            {ITEMS.map((it) => {
              const Icon = it.icon;
              return (
                <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-muted">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${it.color}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-fg">{it.label}</span>
                    <span className="block text-xs text-fg-subtle">{it.hint}</span>
                  </span>
                </Link>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
