import type { lineItems, quotes } from "@/db/schema";
import { formatDay } from "@/lib/dates";
import { INDIAN_STATES, computeGst, isInterstate, lineTaxable } from "@/lib/gst";
import { formatINR } from "@/lib/money";
import type { AppSettings } from "@/server/settings";
import { amountInWords } from "@/server/invoices/words";

type Quote = typeof quotes.$inferSelect;
type Item = typeof lineItems.$inferSelect;

export function QuotePreview({
  quote: q,
  items,
  business: b,
  to,
}: {
  quote: Quote;
  items: Item[];
  business: AppSettings["business"];
  to: { name: string; lines: string[] };
}) {
  const interstate = isInterstate(b.stateCode, q.placeOfSupply);
  const t = computeGst(
    items.map((i) => ({ quantity: Number(i.quantity), unitPricePaise: i.unitPricePaise, gstRateBps: i.gstRateBps })),
    interstate,
  );
  const pos = INDIAN_STATES.find((s) => s.code === q.placeOfSupply);
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-solid shadow-card animate-fade-up">
      <div className="h-1.5 bg-[linear-gradient(90deg,#22c1a3,var(--brand-2),var(--brand))]" />
      <div className="p-5 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div>
            <div className="text-xl font-extrabold text-fg">{b.name}</div>
            <div className="mt-1 whitespace-pre-line text-xs text-fg-muted">{[b.address, b.gstin && `GSTIN: ${b.gstin}`, [b.phone, b.email].filter(Boolean).join(" · ")].filter(Boolean).join("\n")}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Quotation</div>
            <div className="mt-1 text-lg font-extrabold tabular-nums text-fg">{q.number}</div>
            <div className="text-xs text-fg-muted">
              {formatDay(q.issueDate)} · valid till {formatDay(q.validUntil)}
            </div>
            {pos ? <div className="text-xs text-fg-subtle">Place of supply: {pos.name}</div> : null}
          </div>
        </div>
        <div className="mt-6 rounded-2xl bg-brand-soft/50 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-subtle">Prepared for</div>
          <div className="mt-1 font-bold text-fg">{to.name}</div>
          {to.lines.length ? <div className="mt-0.5 whitespace-pre-line text-xs text-fg-muted">{to.lines.join("\n")}</div> : null}
        </div>
        <div className="-mx-5 mt-6 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2">HSN/SAC</th>
                <th className="py-2 pr-2 text-right">Qty</th>
                <th className="py-2 pr-2 text-right">Rate</th>
                <th className="py-2 pr-2 text-right">GST</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-line/70 last:border-0">
                  <td className="py-2.5 pr-2 font-medium text-fg">{it.description}</td>
                  <td className="py-2.5 pr-2 text-fg-muted">{it.hsnSac || "—"}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums">{Number(it.quantity)}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums">{formatINR(it.unitPricePaise)}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums text-fg-muted">{it.gstRateBps / 100}%</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{formatINR(lineTaxable({ quantity: Number(it.quantity), unitPricePaise: it.unitPricePaise, gstRateBps: it.gstRateBps }))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-6 sm:flex-row sm:justify-between">
          <div className="max-w-sm space-y-3 text-xs text-fg-muted">
            <div className="text-sm font-medium text-fg">{amountInWords(t.totalPaise)}</div>
            {q.notes ? <p className="whitespace-pre-line">{q.notes}</p> : null}
            {q.terms ? <p className="whitespace-pre-line text-fg-subtle">{q.terms}</p> : null}
          </div>
          <dl className="w-full space-y-1.5 text-sm sm:w-64">
            <div className="flex justify-between px-3">
              <dt className="text-fg-muted">Taxable value</dt>
              <dd className="font-semibold tabular-nums">{formatINR(t.subtotalPaise)}</dd>
            </div>
            {interstate ? (
              <div className="flex justify-between px-3">
                <dt className="text-fg-muted">IGST</dt>
                <dd className="font-semibold tabular-nums">{formatINR(t.igstPaise)}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between px-3">
                  <dt className="text-fg-muted">CGST</dt>
                  <dd className="font-semibold tabular-nums">{formatINR(t.cgstPaise)}</dd>
                </div>
                <div className="flex justify-between px-3">
                  <dt className="text-fg-muted">SGST</dt>
                  <dd className="font-semibold tabular-nums">{formatINR(t.sgstPaise)}</dd>
                </div>
              </>
            )}
            <div className="flex items-center justify-between rounded-xl bg-brand-soft px-3 py-2">
              <dt className="font-bold">Total</dt>
              <dd className="text-lg font-extrabold tabular-nums">{formatINR(t.totalPaise)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
