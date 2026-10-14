/** Quote status labels and colours (pure). */
import type { QuoteStatus } from "@/db/schema";
import type { Tone } from "@/components/ui/badge";

export const QUOTE_STATUS_META: Record<QuoteStatus | "invoiced", { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  accepted: { label: "Accepted", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  expired: { label: "Expired", tone: "warn" },
  invoiced: { label: "Invoiced", tone: "violet" },
};

/** "invoiced" once converted; a sent quote past its validity shows as expired. */
export function displayQuoteStatus(q: { status: QuoteStatus; invoiceId: string | null; validUntil: string | null }, today: string): QuoteStatus | "invoiced" {
  if (q.invoiceId) return "invoiced";
  if (q.status === "sent" && q.validUntil && q.validUntil < today) return "expired";
  return q.status;
}
