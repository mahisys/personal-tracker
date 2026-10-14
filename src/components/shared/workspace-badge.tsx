import type { WorkspaceKey } from "@/db/schema";
import { WORKSPACE_META } from "@/lib/workspaces";
import { cn } from "@/lib/cn";

export function WorkspaceBadge({ ws, className }: { ws: WorkspaceKey; className?: string }) {
  const m = WORKSPACE_META[ws];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset", m.badge, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.short}
    </span>
  );
}
