"use client";
import { useTransition } from "react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { setWorkspaceFilter } from "@/app/(app)/shell-actions";
import { cn } from "@/lib/cn";

const OPTIONS = [
  { value: "all", label: "All", dot: "bg-[conic-gradient(#10b981,#6366f1,#f59e0b,#10b981)]" },
  { value: "personal", label: "Personal", dot: "bg-emerald-500" },
  { value: "mahisys", label: "MahiSys", dot: "bg-indigo-500" },
  { value: "dsa", label: "DSA", dot: "bg-amber-500" },
];

export function WorkspaceSwitcher({ current }: { current: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className={cn("flex items-center gap-0.5 rounded-xl bg-muted/70 p-1 ring-1 ring-line", pending && "opacity-70")}>
      {OPTIONS.map((o) => {
        const on = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() =>
              start(async () => {
                await setWorkspaceFilter(o.value);
                router.refresh();
              })
            }
            className={cn("relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors", on ? "text-fg" : "text-fg-subtle hover:text-fg")}
          >
            {on ? <motion.span layoutId="ws-pill" className="absolute inset-0 rounded-lg bg-solid shadow-sm ring-1 ring-line" transition={{ type: "spring", stiffness: 450, damping: 35 }} /> : null}
            <span className={cn("relative h-2 w-2 rounded-full", o.dot)} />
            <span className="relative hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
