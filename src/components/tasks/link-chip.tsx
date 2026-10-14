import Link from "next/link";
import type { LinkedEntityType } from "@/db/schema";
import { cn } from "@/lib/cn";
import { LINK_META } from "./meta";

/** A small chip linking a task to its CRM / invoice / DSA / bill record. */
export function LinkChip({ type, id, label, className }: { type: LinkedEntityType; id: string; label?: string | null; className?: string }) {
  const meta = LINK_META[type];
  const Icon = meta.icon;
  return (
    <Link
      href={meta.href(id)}
      className={cn(
        "inline-flex max-w-[16rem] items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-500/20 transition hover:bg-sky-500/20 dark:text-sky-300",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label ?? meta.label}</span>
    </Link>
  );
}
