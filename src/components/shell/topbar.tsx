import Link from "next/link";
import { Bell, Plus, Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { QuickAdd } from "./quick-add";
import { BRAND } from "@/lib/nav";

export function Topbar({ ws, unread }: { ws: string; unread: number }) {
  const Logo = BRAND.icon;
  return (
    <header className="glass sticky top-0 z-40 border-b border-line">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-2)_60%,#22c1a3)] text-white lg:hidden">
          <Logo className="h-4.5 w-4.5" />
        </Link>
        <form action="/search" className="relative hidden max-w-md flex-1 md:block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            name="q"
            placeholder="Search leads, borrowers, invoices, tasks…"
            className="h-10 w-full rounded-xl border border-line bg-solid/60 pl-10 pr-3 text-sm text-fg placeholder:text-fg-subtle transition focus:border-brand focus:bg-solid focus:outline-none focus:ring-4 focus:ring-brand/15"
          />
        </form>
        <div className="flex-1 md:hidden" />
        <WorkspaceSwitcher current={ws} />
        <div className="ml-auto flex items-center gap-1">
          <Link href="/search" className="flex h-9 w-9 items-center justify-center rounded-xl text-fg-muted transition hover:bg-brand-soft hover:text-fg md:hidden" aria-label="Search">
            <Search className="h-[18px] w-[18px]" />
          </Link>
          <Link href="/notifications" className="relative flex h-9 w-9 items-center justify-center rounded-xl text-fg-muted transition hover:bg-brand-soft hover:text-fg" aria-label="Alerts">
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[9px] font-bold text-white ring-2 ring-bg">{unread > 9 ? "9+" : unread}</span>
            ) : null}
          </Link>
          <ThemeToggle />
          <QuickAdd>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </QuickAdd>
        </div>
      </div>
    </header>
  );
}
