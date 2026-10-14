import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS_META, type DerivedInvoiceStatus } from "@/server/invoices/status";

export function InvoiceStatusBadge({ status, className }: { status: DerivedInvoiceStatus; className?: string }) {
  const m = INVOICE_STATUS_META[status];
  return (
    <Badge tone={m.tone} dot className={className}>
      {m.label}
    </Badge>
  );
}
