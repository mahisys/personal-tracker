import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Page title row. Every page starts with one. */
export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-brand">{eyebrow}</div> : null}
        <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Link-based tab strip for sub-sections, e.g. Leads / Contacts / Companies. */
export function SubNav({ items, active }: { items: { href: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav className="mb-6 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((it) => {
        const on = it.href === active;
        return (
          <a
            key={it.href}
            href={it.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all",
              on ? "bg-fg text-bg shadow-md" : "text-fg-muted hover:bg-brand-soft hover:text-fg",
            )}
          >
            {it.label}
            {it.count != null ? (
              <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", on ? "bg-bg/20" : "bg-muted")}>{it.count}</span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}

export function Section({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mb-8", className)}>
      {title || actions ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-fg-muted">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-12 text-center animate-pop-in", className)}>
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--brand-soft),transparent)] text-brand ring-1 ring-brand/15">{icon}</div>
      ) : null}
      <h3 className="text-base font-bold text-fg">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
