import { CalendarArrowUp, Check, SkipForward } from "lucide-react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, MoneyInput, Select } from "@/components/ui/form";
import type { ButtonSize } from "@/components/ui/button";
import { formatDay, todayIST } from "@/lib/dates";
import { formatINR, paiseToInput } from "@/lib/money";
import { moveBillAction, payBill, skipBillAction } from "@/server/planner/actions";
import type { AccountOption, CategoryOption } from "@/components/books/transaction-dialog";

export type ActionBill = {
  id: string;
  title: string;
  amountPaise: number;
  dueDate: string;
  accountId: string | null;
  categoryId: string | null;
  canMove: boolean;
  latestDate: string | null;
  recurrence: unknown;
};

/** "Mark paid" → modal with date, account and amount prefilled; records the expense. */
export function PayBillDialog({ bill, accounts, categories, size = "sm", label = "Mark paid" }: { bill: ActionBill; accounts: AccountOption[]; categories: CategoryOption[]; size?: ButtonSize; label?: string }) {
  const today = todayIST();
  const payable = accounts.filter((a) => a.type !== "loan");
  return (
    <Modal trigger={<><Check className="h-3.5 w-3.5" /> {label}</>} title={`Pay ${bill.title}`} description={`${formatINR(bill.amountPaise)} due ${formatDay(bill.dueDate)}`} variant="success" size={size}>
      {payable.length === 0 ? (
        <p className="text-sm text-fg-muted">Add a bank, cash or card account in <a className="font-semibold text-brand" href="/books/accounts?new=1">Books</a> first.</p>
      ) : (
        <ActionForm action={payBill}>
          <input type="hidden" name="id" value={bill.id} />
          <FormGrid>
            <Field label="Amount paid">
              <MoneyInput name="amount" required defaultValue={paiseToInput(bill.amountPaise)} className="font-bold" />
            </Field>
            <Field label="Paid on">
              <Input type="date" name="date" required defaultValue={today} />
            </Field>
            <Field label="Paid from">
              <Select name="accountId" defaultValue={bill.accountId ?? payable[0].id} required>
                {payable.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ••${a.last4}` : ""}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select name="categoryId" defaultValue={bill.categoryId ?? ""}>
                <option value="">Uncategorised</option>
                {categories.filter((c) => c.kind === "expense").map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          {bill.recurrence ? <p className="mt-3 text-xs text-fg-muted">This repeats — we&apos;ll schedule the next one automatically.</p> : null}
          <ModalActions>
            <SubmitButton variant="success" pendingText="Recording…"><Check className="h-4 w-4" /> Record payment</SubmitButton>
          </ModalActions>
        </ActionForm>
      )}
    </Modal>
  );
}

export function MoveBillDialog({ bill, size = "sm" }: { bill: ActionBill; size?: ButtonSize }) {
  return (
    <Modal trigger={<><CalendarArrowUp className="h-3.5 w-3.5" /> Move</>} title={`Move ${bill.title}`} description={bill.latestDate ? `It can safely wait until ${formatDay(bill.latestDate)}.` : "Pick a new date."} variant="secondary" size={size}>
      <ActionForm action={moveBillAction}>
        <input type="hidden" name="id" value={bill.id} />
        <Field label="New date">
          <Input type="date" name="toDate" required defaultValue={bill.latestDate ?? bill.dueDate} max={bill.latestDate ?? undefined} min={todayIST()} />
        </Field>
        <ModalActions>
          <SubmitButton pendingText="Moving…">Move payment</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );
}

export function SkipBillButton({ bill }: { bill: ActionBill }) {
  return (
    <ActionButton
      action={skipBillAction}
      hidden={{ id: bill.id }}
      variant="ghost"
      size="sm"
      title="Skip this one"
      confirm={bill.recurrence ? "Skip this occurrence? The next one will be scheduled." : "Skip this payment? It will drop off the planner."}
    >
      <SkipForward className="h-3.5 w-3.5" /> Skip
    </ActionButton>
  );
}
