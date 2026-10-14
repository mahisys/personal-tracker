import { BadgeIndianRupee, FileCheck2, HandCoins, Pencil } from "lucide-react";
import type { InferSelectModel } from "drizzle-orm";
import type { payouts } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { formatINR, paiseToInput } from "@/lib/money";
import { editPayoutAction, markInvoicedAction, markPartnerPaidAction, markReceivedAction } from "@/server/dsa/actions";
import { netOf } from "@/server/dsa/logic";

type Payout = InferSelectModel<typeof payouts>;
type Opt = { id: string; name: string };

function AccountSelect({ accounts }: { accounts: Opt[] }) {
  return (
    <Select name="accountId" defaultValue={accounts[0]?.id ?? ""} required>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </Select>
  );
}

export function InvoiceButton({ payout, today, size = "sm" }: { payout: Payout; today: string; size?: "sm" | "md" }) {
  return (
    <Modal
      trigger={
        <>
          <FileCheck2 className="h-3.5 w-3.5" /> Mark invoiced
        </>
      }
      variant="soft"
      size={size}
      title="Mark payout invoiced"
      description={`Gross ${formatINR(payout.grossPaise, { whole: true })} · net ${formatINR(netOf(payout), { whole: true })}`}
    >
      <ActionForm action={markInvoicedAction}>
        <input type="hidden" name="payoutId" value={payout.id} />
        <FormGrid>
          <Field label="Invoice no.">
            <Input name="invoiceNo" required placeholder="e.g. DSA/26-27/014" />
          </Field>
          <Field label="Invoice date">
            <Input type="date" name="invoiceDate" defaultValue={today} required />
          </Field>
        </FormGrid>
        <ModalActions>
          <SubmitButton>Mark invoiced</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );
}

export function ReceiveButton({ payout, accounts, today, size = "sm" }: { payout: Payout; accounts: Opt[]; today: string; size?: "sm" | "md" }) {
  return (
    <Modal
      trigger={
        <>
          <BadgeIndianRupee className="h-3.5 w-3.5" /> Mark received
        </>
      }
      variant="success"
      size={size}
      title="Payout received 🎉"
      description="Books it as DSA commission income, with TDS noted for your tax credit."
    >
      <ActionForm action={markReceivedAction}>
        <input type="hidden" name="payoutId" value={payout.id} />
        <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-muted p-3 text-center text-xs">
          <div>
            <div className="text-fg-subtle">Gross</div>
            <div className="font-bold tabular-nums text-fg">{formatINR(payout.grossPaise, { whole: true })}</div>
          </div>
          <div>
            <div className="text-fg-subtle">+ GST</div>
            <div className="font-bold tabular-nums text-fg">{formatINR(payout.gstPaise, { whole: true })}</div>
          </div>
          <div>
            <div className="text-fg-subtle">− TDS</div>
            <div className="font-bold tabular-nums text-fg">{formatINR(payout.tdsPaise, { whole: true })}</div>
          </div>
        </div>
        <FormGrid>
          <Field label="Received on">
            <Input type="date" name="receivedDate" defaultValue={today} required />
          </Field>
          <Field label="Into account">
            <AccountSelect accounts={accounts} />
          </Field>
          <Field label="Net amount received">
            <MoneyInput name="netReceived" defaultValue={paiseToInput(netOf(payout))} required />
          </Field>
          <Field label="TDS deducted" hint="Check against Form 26AS">
            <MoneyInput name="tds" defaultValue={paiseToInput(payout.tdsPaise)} />
          </Field>
        </FormGrid>
        <ModalActions>
          <SubmitButton variant="success" pendingText="Booking…">
            Record payout
          </SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );
}

export function PartnerPaidButton({ payout, partnerName, accounts, today }: { payout: Payout; partnerName: string; accounts: Opt[]; today: string }) {
  return (
    <Modal
      trigger={
        <>
          <HandCoins className="h-3.5 w-3.5" /> Pay partner
        </>
      }
      variant="secondary"
      size="sm"
      title={`Pay ${partnerName}`}
      description="Books it as a sub-connector payout expense."
    >
      <ActionForm action={markPartnerPaidAction}>
        <input type="hidden" name="payoutId" value={payout.id} />
        <FormGrid>
          <Field label="Amount">
            <MoneyInput name="amount" defaultValue={paiseToInput(payout.subConnectorSharePaise)} required />
          </Field>
          <Field label="Paid on">
            <Input type="date" name="date" defaultValue={today} required />
          </Field>
          <Field label="From account" className="sm:col-span-2">
            <AccountSelect accounts={accounts} />
          </Field>
        </FormGrid>
        <ModalActions>
          <SubmitButton>Mark paid</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );
}

export function EditPayoutButton({ payout }: { payout: Payout }) {
  return (
    <Modal trigger={<Pencil className="h-3.5 w-3.5" />} variant="ghost" size="icon" title="Adjust payout" description="Override the numbers if the lender's sheet differs.">
      <ActionForm action={editPayoutAction}>
        <input type="hidden" name="payoutId" value={payout.id} />
        <FormGrid>
          <Field label="Gross commission">
            <MoneyInput name="gross" defaultValue={paiseToInput(payout.grossPaise)} required />
          </Field>
          <Field label="Expected on">
            <Input type="date" name="expectedDate" defaultValue={payout.expectedDate ?? ""} />
          </Field>
          <Field label="GST" hint="Blank = from settings">
            <MoneyInput name="gst" defaultValue={paiseToInput(payout.gstPaise)} />
          </Field>
          <Field label="TDS" hint="Blank = from settings">
            <MoneyInput name="tds" defaultValue={paiseToInput(payout.tdsPaise)} />
          </Field>
          {payout.subConnectorId ? (
            <Field label="Partner share">
              <MoneyInput name="share" defaultValue={paiseToInput(payout.subConnectorSharePaise)} />
            </Field>
          ) : null}
          <Field label="Notes" className="sm:col-span-2">
            <Textarea name="notes" defaultValue={payout.notes} rows={2} />
          </Field>
        </FormGrid>
        <ModalActions>
          <SubmitButton>Save</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );
}
