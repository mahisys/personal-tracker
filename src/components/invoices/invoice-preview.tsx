import type { invoices, lineItems } from "@/db/schema";
import { formatDay } from "@/lib/dates";
import { INDIAN_STATES, lineTaxable } from "@/lib/gst";
import { formatINR } from "@/lib/money";
import type { AppSettings } from "@/server/settings";
import { amountInWords } from "@/server/invoices/words";
import { cn } from "@/lib/cn";

type Invoice = typeof invoices.$inferSelect;
type Item = typeof lineItems.$inferSelect;

function stateLabel(code: string | null | undefined) {
  if (!code) return "—";
  const s = INDIAN_STATES.find((x) => x.code === code);
  return s ? `${s.name} (${code})` : code;
}

/** On-screen rendering of a GST tax invoice — mirrors the PDF. */
export function InvoicePreview({ invoice: inv, items, business: b, stamp }: { invoice: Invoice; items: Item[]; business: AppSettings["business"]; stamp?: { label: string; tone: "good" | "bad" | "neutral" } | null }) {
  const bt = inv.billTo;
  const balance = Math.max(0, inv.totalPaise - inv.paidPaise);
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-solid shadow-card animate-fade-up">
      <div className="h-1.5 bg-[linear-gradient(90deg,var(--brand),var(--brand-2),#22c1a3)]" />
      {stamp ? (
        <div
          className={cn(
            "pointer-events-none absolute right-6 top-24 rotate-[-12deg] rounded-xl border-4 px-4 py-1 text-2xl font-black uppercase tracking-widest opacity-25 sm:right-16 sm:top-28 sm:text-4xl",
            stamp.tone === "good" && "border-emerald-500 text-emerald-500",
            stamp.tone === "bad" && "border-rose-500 text-rose-500",
            stamp.tone === "neutral" && "border-fg-subtle text-fg-subtle",
          )}
        >
          {stamp.label}
        </div>
      ) : null}
      <div className="p-5 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div className="min-w-0">
            <div className="text-xl font-extrabold tracking-tight text-fg">{b.name}</div>
            {b.legalName && b.legalName !== b.name ? <div className="text-sm text-fg-muted">{b.legalName}</div> : null}
            <div className="mt-2 whitespace-pre-line text-xs leading-relaxed text-fg-muted">
              {[b.address, b.stateCode ? `State: ${stateLabel(b.stateCode)}` : "", b.gstin ? `GSTIN: ${b.gstin}` : "", b.pan ? `PAN: ${b.pan}` : "", [b.phone, b.email].filter(Boolean).join(" · ")]
                .filter(Boolean)
                .join("\n")}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Tax invoice</div>
            <div className="mt-1 text-lg font-extrabold tabular-nums text-fg">{inv.number}</div>
            <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-xs sm:justify-end">
              <dt className="text-fg-subtle">Issued</dt>
              <dd className="font-semibold text-fg">{formatDay(inv.issueDate)}</dd>
              <dt className="text-fg-subtle">Due</dt>
              <dd className="font-semibold text-fg">{formatDay(inv.dueDate)}</dd>
              <dt className="text-fg-subtle">Place of supply</dt>
              <dd className="font-semibold text-fg">{stateLabel(inv.placeOfSupply)}</dd>
            </dl>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-brand-soft/50 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-subtle">Bill to</div>
          <div className="mt-1 font-bold text-fg">{bt.name}</div>
          <div className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-fg-muted">
            {[bt.address, bt.stateCode ? `State: ${stateLabel(bt.stateCode)}` : "", bt.gstin ? `GSTIN: ${bt.gstin}` : "Unregistered", bt.email].filter(Boolean).join("\n")}
          </div>
        </div>

        <div className="-mx-5 mt-6 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2">HSN/SAC</th>
                <th className="py-2 pr-2 text-right">Qty</th>
                <th className="py-2 pr-2 text-right">Rate</th>
                <th className="py-2 pr-2 text-right">Taxable</th>
                <th className="py-2 text-right">GST</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id} className="border-b border-line/70 last:border-0">
                  <td className="py-2.5 pr-2 text-fg-subtle">{i + 1}</td>
                  <td className="py-2.5 pr-2 font-medium text-fg">{it.description}</td>
                  <td className="py-2.5 pr-2 text-fg-muted">{it.hsnSac || "—"}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums">{Number(it.quantity)}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums">{formatINR(it.unitPricePaise)}</td>
                  <td className="py-2.5 pr-2 text-right font-semibold tabular-nums">{formatINR(lineTaxable({ quantity: Number(it.quantity), unitPricePaise: it.unitPricePaise, gstRateBps: it.gstRateBps }))}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg-muted">{it.gstRateBps / 100}%</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-fg-subtle">
                    No line items yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-6 sm:flex-row sm:justify-between">
          <div className="max-w-sm space-y-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-subtle">Amount in words</div>
              <div className="mt-1 text-sm font-medium text-fg">{amountInWords(inv.totalPaise)}</div>
            </div>
            {b.bankAccountNo || b.upiId ? (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-subtle">Payment details</div>
                <div className="mt-1 whitespace-pre-line text-xs leading-relaxed text-fg-muted">
                  {[b.bankName && `Bank: ${b.bankName}`, b.bankAccountNo && `A/c no.: ${b.bankAccountNo}`, b.bankIfsc && `IFSC: ${b.bankIfsc}`, b.upiId && `UPI: ${b.upiId}`].filter(Boolean).join("\n")}
                </div>
              </div>
            ) : null}
            {inv.terms || inv.notes ? (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-fg-subtle">Terms &amp; notes</div>
                <div className="mt-1 whitespace-pre-line text-xs leading-relaxed text-fg-muted">{[inv.terms, inv.notes].filter(Boolean).join("\n\n")}</div>
              </div>
            ) : null}
          </div>
          <dl className="w-full space-y-1.5 text-sm sm:w-72">
            <TotalRow label="Taxable value" value={inv.subtotalPaise} />
            {inv.interstate ? (
              <TotalRow label="IGST" value={inv.igstPaise} />
            ) : (
              <>
                <TotalRow label="CGST" value={inv.cgstPaise} />
                <TotalRow label="SGST" value={inv.sgstPaise} />
              </>
            )}
            <div className="flex items-center justify-between rounded-xl bg-brand-soft px-3 py-2">
              <dt className="font-bold text-fg">Total</dt>
              <dd className="text-lg font-extrabold tabular-nums text-fg">{formatINR(inv.totalPaise)}</dd>
            </div>
            {inv.paidPaise > 0 ? (
              <>
                <TotalRow label="Received (incl. TDS)" value={inv.paidPaise} />
                <div className="flex items-center justify-between px-3">
                  <dt className="font-semibold text-fg">Balance due</dt>
                  <dd className={cn("font-extrabold tabular-nums", balance > 0 ? "text-rose-600 dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300")}>{formatINR(balance)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>
        <p className="mt-8 border-t border-line pt-4 text-center text-[11px] text-fg-subtle">This is a computer-generated invoice.</p>
      </div>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-fg">{formatINR(value)}</dd>
    </div>
  );
}
