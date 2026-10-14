"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { NAV, BRAND } from "@/lib/nav";
import { cn } from "@/lib/cn";

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ badges }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  const groups = [...new Set(NAV.map((n) => n.group))];
  const Logo = BRAND.icon;
  return (
    <aside className="glass sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line lg:flex">
      <Link href="/" className="group flex items-center gap-3 px-6 pb-6 pt-7">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-2)_60%,#22c1a3)] text-white shadow-[0_10px_24px_-10px_var(--brand)] transition-transform duration-500 group-hover:rotate-[14deg] group-hover:scale-105">
          <Logo className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight text-fg">{BRAND.name}</div>
          <div className="text-xs font-semibold text-fg-subtle">{BRAND.tagline}</div>
        </div>
      </Link>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-fg-subtle">{g}</div>
            <ul className="space-y-0.5">
              {NAV.filter((n) => n.group === g).map((n) => {
                const on = isActive(pathname, n.href);
                const Icon = n.icon;
                const badge = badges?.[n.href];
                return (
                  <li key={n.href} className="relative">
                    {on ? (
                      <motion.div
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-xl bg-[linear-gradient(135deg,var(--brand-soft),transparent)] ring-1 ring-brand/20"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    ) : null}
                    <Link
                      href={n.href}
                      className={cn(
                        "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                        on ? "text-brand" : "text-fg-muted hover:text-fg",
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px] transition-transform", on && "scale-110")} />
                      <span className="flex-1">{n.label}</span>
                      {badge ? (
                        <span className="rounded-full bg-bad px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums">{badge > 99 ? "99+" : badge}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
