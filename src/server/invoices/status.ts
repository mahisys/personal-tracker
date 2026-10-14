/**
 * Derived invoice status (pure). "overdue" is never stored; it is computed from the due date and balance.
 */
import type { InvoiceStatus } from "@/db/schema";
import type { Tone } from "@/components/ui/badge";

export type DerivedInvoiceStatus = InvoiceStatus | "overdue";

export type StatusInput = { status: InvoiceStatus; totalPaise: number; paidPaise: number; dueDate: string };

/**
 * - cancelled stays cancelled
 * - paid when paidPaise ≥ totalPaise (and there is something to pay)
 * - overdue when due date has passed, a balance remains and the invoice is sent / part paid
 * - otherwise the stored status
 */
export function deriveInvoiceStatus(inv: StatusInput, today: string): DerivedInvoiceStatus {
  if (inv.status === "cancelled") return "cancelled";
  const balance = inv.totalPaise - inv.paidPaise;
  if (inv.totalPaise > 0 && balance <= 0) return "paid";
  if (inv.dueDate < today && balance > 0 && (inv.status === "sent" || inv.status === "part_paid")) return "overdue";
  return inv.status;
}

export function balanceOf(inv: { totalPaise: number; paidPaise: number }): number {
  return Math.max(0, inv.totalPaise - inv.paidPaise);
}

export const INVOICE_STATUS_META: Record<DerivedInvoiceStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  part_paid: { label: "Part paid", tone: "warn" },
  paid: { label: "Paid", tone: "good" },
  overdue: { label: "Overdue", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const INVOICE_TABS = ["all", "draft", "unpaid", "overdue", "paid"] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number];

export function matchesTab(s: DerivedInvoiceStatus, tab: InvoiceTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "draft":
      return s === "draft";
    case "unpaid":
      return s === "sent" || s === "part_paid" || s === "overdue";
    case "overdue":
      return s === "overdue";
    case "paid":
      return s === "paid";
  }
}
