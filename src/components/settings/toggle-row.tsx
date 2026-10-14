import type { ReactNode } from "react";

/** A labelled on/off switch backed by a real checkbox (works in plain forms, no JS needed). */
export function ToggleRow({ name, label, description, defaultChecked }: { name: string; label: ReactNode; description?: ReactNode; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-solid/50 px-4 py-3 transition hover:border-line-strong">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-fg-muted">{description}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="h-7 w-12 rounded-full bg-muted ring-1 ring-inset ring-line-strong transition-colors duration-300 peer-checked:bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] peer-checked:ring-0 peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
