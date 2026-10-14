"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, Link2, List, Loader2, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { PRIORITY_META } from "./meta";

/** View switch + filters for /tasks. Everything lives in the URL so views are shareable and survive reloads. */
export function TaskFilters({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const view = params.get("view") === "board" ? "board" : "list";
  const project = params.get("project") ?? "";
  const priority = params.get("priority") ?? "";
  const linked = params.get("linked") === "1";

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    next.delete("new");
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = !!(project || priority || linked || params.get("q"));

  return (
    <div className="mb-5 flex flex-col gap-3 animate-fade-up lg:flex-row lg:items-center">
      <div className="relative inline-flex shrink-0 self-start rounded-xl border border-line bg-solid/70 p-1 shadow-sm" role="tablist" aria-label="View">
        {(
          [
            ["list", "List", List],
            ["board", "Board", Columns3],
          ] as const
        ).map(([key, label, Icon]) => {
          const on = view === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => update({ view: key === "list" ? null : key })}
              className={cn("relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors", on ? "text-white" : "text-fg-muted hover:text-fg")}
            >
              {on ? (
                <motion.span
                  layoutId="task-view-pill"
                  className="absolute inset-0 rounded-lg bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] shadow-md"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks, notes, #tags"
          aria-label="Search tasks"
          className="h-10 w-full rounded-xl border border-line-strong bg-solid/80 pl-10 pr-9 text-sm text-fg placeholder:text-fg-subtle transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
        />
        {pending ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-fg-subtle" /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Project" value={project} onChange={(e) => update({ project: e.target.value || null })} className="h-10 w-auto min-w-0 max-w-[12rem]">
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Priority" value={priority} onChange={(e) => update({ priority: e.target.value || null })} className="h-10 w-auto">
          <option value="">Any priority</option>
          {[1, 2, 3, 4].map((p) => (
            <option key={p} value={p}>
              {PRIORITY_META[p].label}
            </option>
          ))}
        </Select>
        <button
          type="button"
          aria-pressed={linked}
          onClick={() => update({ linked: linked ? null : "1" })}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition",
            linked ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" : "border-line-strong bg-solid/80 text-fg-muted hover:text-fg",
          )}
        >
          <Link2 className="h-4 w-4" /> Linked
        </button>
        {active ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              update({ project: null, priority: null, linked: null, q: null });
            }}
            className="inline-flex h-10 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold text-fg-subtle transition hover:text-fg"
          >
            <X className="h-4 w-4" /> Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
