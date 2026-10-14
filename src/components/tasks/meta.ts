/** Labels, colours and links for tasks and projects. Safe on client and server. */
import { Building2, FileText, Landmark, Receipt, Target, User, type LucideIcon } from "lucide-react";
import type { LinkedEntityType, ProjectStatus, TaskStatus } from "@/db/schema";
import type { Tone } from "@/components/ui/badge";

export const STATUS_META: Record<TaskStatus, { label: string; tone: Tone; dot: string }> = {
  todo: { label: "To do", tone: "neutral", dot: "bg-slate-400" },
  doing: { label: "Doing", tone: "brand", dot: "bg-violet-500" },
  waiting: { label: "Waiting", tone: "warn", dot: "bg-amber-500" },
  done: { label: "Done", tone: "good", dot: "bg-emerald-500" },
  cancelled: { label: "Cancelled", tone: "neutral", dot: "bg-slate-300" },
};

/** Columns on the board, in order */
export const BOARD_COLUMNS = ["todo", "doing", "waiting", "done"] as const satisfies readonly TaskStatus[];
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const PRIORITY_META: Record<number, { label: string; short: string; className: string; ring: string }> = {
  1: { label: "P1 · Urgent", short: "P1", className: "text-rose-600 bg-rose-500/10 dark:text-rose-300", ring: "border-rose-500" },
  2: { label: "P2 · High", short: "P2", className: "text-amber-700 bg-amber-500/12 dark:text-amber-300", ring: "border-amber-500" },
  3: { label: "P3 · Normal", short: "P3", className: "text-sky-700 bg-sky-500/10 dark:text-sky-300", ring: "border-sky-500/70" },
  4: { label: "P4 · Someday", short: "P4", className: "text-fg-subtle bg-muted", ring: "border-line-strong" },
};

export function priorityMeta(p: number) {
  return PRIORITY_META[p] ?? PRIORITY_META[3];
}

export const LINK_META: Record<LinkedEntityType, { label: string; icon: LucideIcon; href: (id: string) => string }> = {
  lead: { label: "Lead", icon: Target, href: (id) => `/crm/leads/${id}` },
  invoice: { label: "Invoice", icon: FileText, href: (id) => `/invoices/${id}` },
  loan_file: { label: "Loan file", icon: Landmark, href: (id) => `/dsa/files/${id}` },
  bill: { label: "Bill", icon: Receipt, href: (id) => `/planner/bills/${id}` },
  contact: { label: "Contact", icon: User, href: (id) => `/crm/contacts/${id}` },
  company: { label: "Company", icon: Building2, href: (id) => `/crm/companies/${id}` },
};

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; tone: Tone }> = {
  planned: { label: "Planned", tone: "info" },
  active: { label: "Active", tone: "brand" },
  on_hold: { label: "On hold", tone: "warn" },
  done: { label: "Done", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const HEALTH_META = {
  on_track: { label: "On track", tone: "good" },
  at_risk: { label: "At risk", tone: "warn" },
  late: { label: "Late", tone: "bad" },
  no_data: { label: "No deadline", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

/** Suggestions for the free-text task type (drives estimate accuracy). */
export const TASK_TYPE_SUGGESTIONS = ["development", "design", "sales call", "follow-up", "meeting", "admin", "documentation", "chore", "errand"];

/** Serializable task shape passed to client components. */
export type TaskView = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: number;
  workspace: "personal" | "mahisys" | "dsa";
  dueDate: string | null;
  dueTime: string | null;
  estimateMinutes: number | null;
  actualMinutes: number;
  taskType: string | null;
  projectId: string | null;
  projectName: string | null;
  parentTaskId: string | null;
  linkedType: LinkedEntityType | null;
  linkedId: string | null;
  linkedLabel: string | null;
  tags: string[];
  subtaskTotal: number;
  subtaskDone: number;
  recurring: boolean;
  completedAt: string | null;
  /** Projected finish (ETA), when known */
  etaDate?: string | null;
  etaLate?: boolean;
};

/** "2h 30m" → split for the hours/minutes inputs */
export function splitMinutes(min: number | null | undefined): { h: string; m: string } {
  if (min == null) return { h: "", m: "" };
  return { h: String(Math.floor(min / 60)), m: String(min % 60) };
}
