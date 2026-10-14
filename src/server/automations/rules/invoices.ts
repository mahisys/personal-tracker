import "server-only";
import { and, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { invoices, type WorkspaceKey } from "@/db/schema";
import { diffDays, formatDay } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { raiseOnce } from "../helpers";
import { listConfig } from "../meta";
import type { Rule } from "../types";

export type InvoiceLite = {
  id: string;
  number: string;
  dueDate: string;
  totalPaise: number;
  paidPaise: number;
  billTo: { name: string };
  workspace: WorkspaceKey;
};

/** A friendly, ready-to-paste payment reminder. */
export function reminderMessage(inv: InvoiceLite, daysLate: number, businessName = "MahiSys"): string {
  const balance = formatINR(inv.totalPaise - inv.paidPaise);
  const first = inv.billTo.name?.split(" ")[0] || "there";
  const tone =
    daysLate >= 15
      ? "Could you please let me know when we can expect the payment? Happy to help if anything is holding it up."
      : daysLate >= 7
        ? "Could you please check on this and share an expected payment date?"
        : "Just a gentle reminder in case it slipped through.";
  return `Hi ${first}, invoice ${inv.number} for ${balance} was due on ${formatDay(inv.dueDate)}. ${tone} Thank you! — ${businessName}`;
}

/**
 * The reminder milestone (from config days past due, default 1/7/15) an unpaid invoice has reached.
 * Uses the largest milestone ≤ days late so a missed run still catches up; each fires once per invoice.
 */
export function decideInvoiceOverdue(inv: InvoiceLite, today: string, milestones: number[]): { milestone: number; daysLate: number; dedupeKey: string } | null {
  const balance = inv.totalPaise - inv.paidPaise;
  if (balance <= 0) return null;
  const daysLate = diffDays(inv.dueDate, today);
  if (daysLate <= 0) return null;
  const reached = milestones.filter((m) => m > 0 && m <= daysLate);
  if (!reached.length) return null;
  const milestone = Math.max(...reached);
  return { milestone, daysLate, dedupeKey: `invoice_overdue:${inv.id}:${milestone}` };
}

export const invoiceOverdue: Rule = {
  key: "invoice_overdue",
  async run({ today, config, settings }) {
    const milestones = listConfig(config, "days", [1, 7, 15]);
    const rows = await db
      .select({
        id: invoices.id,
        number: invoices.number,
        dueDate: invoices.dueDate,
        totalPaise: invoices.totalPaise,
        paidPaise: invoices.paidPaise,
        billTo: invoices.billTo,
        workspace: invoices.workspace,
      })
      .from(invoices)
      .where(and(inArray(invoices.status, ["sent", "part_paid"]), lt(invoices.dueDate, today)));
    let n = 0;
    for (const inv of rows) {
      const d = decideInvoiceOverdue(inv, today, milestones);
      if (!d) continue;
      const raised = await raiseOnce({
        kind: "invoice_overdue",
        dedupeKey: d.dedupeKey,
        title: `${inv.number} · ${formatINR(inv.totalPaise - inv.paidPaise)} overdue from ${inv.billTo.name}`,
        body: `${d.daysLate} day${d.daysLate === 1 ? "" : "s"} past due. Suggested message: “${reminderMessage(inv, d.daysLate, settings.business.name)}”`,
        link: `/invoices/${inv.id}`,
        workspace: inv.workspace,
      });
      if (raised) n++;
    }
    return { notifications: n, note: `${rows.length} unpaid invoices past due` };
  },
};
