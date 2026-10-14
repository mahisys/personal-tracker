"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { MOBILE_NAV } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { isActive } from "./sidebar";

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-3 bottom-3 z-50 bg-solid rounded-2xl border border-line shadow-pop lg:hidden pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-stretch justify-around">
        {MOBILE_NAV.map((n) => {
          const on = isActive(pathname, n.href);
          const Icon = n.icon;
          return (
            <li key={n.href} className="relative flex-1">
              <Link href={n.href} className={cn("relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold", on ? "text-brand" : "text-fg-subtle")}>
                {on ? <motion.span layoutId="mnav" className="absolute inset-x-3 inset-y-1 rounded-xl bg-brand-soft" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
                <Icon className="relative h-5 w-5" />
                <span className="relative">{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
