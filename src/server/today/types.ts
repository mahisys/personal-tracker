/** Shapes shared by the Today queries and the Today components (types only — safe on the client). */
import type { WorkspaceKey } from "@/db/schema";

export type NeedsKind = "task" | "lead" | "bill" | "invoice" | "loan_file" | "renewal";

export type NeedsItem = {
  /** Unique across kinds, e.g. "task:<id>" */
  key: string;
  kind: NeedsKind;
  id: string;
  title: string;
  /** One short line of context: "Overdue by 2 days · Website revamp" */
  context: string;
  workspace: WorkspaceKey;
  href: string;
  /** The IST day this is due / was due; null when undated (e.g. a lead without a follow-up) */
  date: string | null;
  overdue: boolean;
  amountPaise?: number | null;
  /** For a tap-to-call link */
  phone?: string | null;
  /** Tasks only */
  priority?: number;
  dueTime?: string | null;
  estimateMinutes?: number | null;
  recurring?: boolean;
};

export type ComingUpKind = "task" | "bill" | "invoice" | "renewal" | "lead" | "payout";

export type ComingUpItem = {
  key: string;
  kind: ComingUpKind;
  title: string;
  sub?: string | null;
  href: string;
  date: string;
  workspace: WorkspaceKey;
  amountPaise?: number | null;
  /** money direction for colouring */
  flow?: "in" | "out";
};
