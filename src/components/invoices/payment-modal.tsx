import { HandCoins } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, MoneyInput, Select } from "@/components/ui/form";
import { recordInvoicePayment } from "@/server/invoices/actions";
import { formatINR, paiseToInput } from "@/lib/money";
import { todayIST } from "@/lib/dates";
import { LinkButton } from "@/components/ui/button";

export const PAYMENT_MODES = ["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Cash", "Card", "Other"];

export function PaymentModal({
  invoiceId,
  number,
  balancePaise,
  accounts,
  defaultOpen,
  size = "md",
}: {
  invoiceId: string;
  number: string;
  balancePaise: number;
  accounts: { id: string; name: string }[];
  defaultOpen?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <Modal
      trigger={
        <>
          <HandCoins className="h-4 w-4" /> Record payment
        </>
      }
      variant="success"
      size={size}
      title="Record a payment"
      description={`${number} · ${formatINR(balancePaise)} outstanding`}
      defaultOpen={defaultOpen}
    >
      {accounts.length === 0 ? (
        <div className="space-y-4 text-sm text-fg-muted">
          <p>Add a bank or cash account in Books first, so the money lands somewhere.</p>
          <LinkButton href="/books/accounts" variant="soft" size="sm">
            Go to accounts
          </LinkButton>
        </div>
      ) : (
        <ActionForm action={recordInvoicePayment}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <FormGrid>
            <Field label="Amount received" hint="What actually hit your account">
              <MoneyInput name="amount" defaultValue={paiseToInput(balancePaise)} required autoFocus />
            </Field>
            <Field label="TDS deducted" hint="Counts towards the invoice; claim it later">
              <MoneyInput name="tds" placeholder="0" />
            </Field>
            <Field label="Date">
              <Input type="date" name="date" defaultValue={todayIST()} required />
            </Field>
            <Field label="Into account">
              <Select name="accountId" required defaultValue={accounts[0]?.id}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mode">
              <Select name="mode" defaultValue="NEFT">
                {PAYMENT_MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Reference" hint="UTR, cheque no., UPI ref">
              <Input name="reference" placeholder="Optional" />
            </Field>
          </FormGrid>
          <ModalActions>
            <SubmitButton variant="success" pendingText="Recording…">
              Record payment
            </SubmitButton>
          </ModalActions>
        </ActionForm>
      )}
    </Modal>
  );
}
