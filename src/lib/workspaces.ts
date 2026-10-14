import type { WorkspaceKey } from "@/db/schema";

export const WORKSPACE_META: Record<WorkspaceKey, { name: string; short: string; dot: string; badge: string }> = {
  personal: { name: "Personal", short: "Personal", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300" },
  mahisys: { name: "MahiSys", short: "MahiSys", dot: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300" },
  dsa: { name: "Loan DSA", short: "DSA", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300" },
};

export const WORKSPACE_OPTIONS = (Object.keys(WORKSPACE_META) as WorkspaceKey[]).map((k) => ({ value: k, label: WORKSPACE_META[k].name }));
