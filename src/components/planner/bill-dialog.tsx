"use client";
import { useState, type ReactNode } from "react";
import { BILL_KINDS, type BillKind, type BillPriority, type Recurrence, type WorkspaceKey } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { RecurrenceFields } from "@/components/client/recurrence-fields";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";
import { paiseToInput } from "@/lib/money";
import { addDays, todayIST } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { saveBill } from "@/server/planner/actions";
import type { AccountOption, CategoryOption } from "@/components/books/transaction-dialog";

const KIND_LABEL: Record<BillKind, string> = {
  bill: "Bill", emi: "EMI", credit_card: "Credit card", rent: "Rent", subscription: "Subscription", insurance: "Insurance",
  utility: "Utility", tax: "Tax", salary: "Salary", vendor: "Vendor", fees: "Fees", other: "Other",
};

const PRIORITIES: { value: BillPriority; label: string; hint: string; on: string }[] = [
  { value: "must", label: "Must pay", hint: "Penalty or harm if late", on: "bg-rose-500 text-white shadow-[0_6px_16px_-6px_#f43f5e]" },
  { value: "important", label: "Important", hint: "Pay on time if you can", on: "bg-amber-500 text-white shadow-[0_6px_16px_-6px_#f59e0b]" },
  { value: "can_wait", label: "Can wait", hint: "Flexible", on: "bg-sky-500 text-white shadow-[0_6px_16px_-6px_#0ea5e9]" },
];

export type BillDefaults = {
  id?: string;
  title?: string;
  payee?: string | null;
  kind?: BillKind;
  workspace?: WorkspaceKey;
  categoryId?: string | null;
  accountId?: string | null;
  amountPaise?: number;
  dueDate?: string;
  priority?: BillPriority;
  canMove?: boolean;
  latestDate?: string | null;
  recurrence?: Recurrence | null;
  remindDaysBefore?: number[];
  notes?: string;
};

export function BillDialog({
  trigger,
  defaults = {},
  accounts,
  categories,
  variant = "primary",
  size = "md",
  triggerClassName,
  defaultOpen,
}: {
  trigger: ReactNode;
  defaults?: BillDefaults;
  accounts: AccountOption[];
  categories: CategoryOption[];
  variant?: ButtonVariant;
  size?: ButtonSize;
  triggerClassName?: string;
  defaultOpen?: boolean;
}) {
  return (
    <Modal
      trigger={trigger}
      title={defaults.id ? "Edit payment" : "Plan a payment"}
      description="Bills, EMIs, rent, subscriptions — anything due on a date."
      variant={variant}
      size={size}
      triggerClassName={triggerClassName}
      defaultOpen={defaultOpen}
      wide
    >
      <BillForm defaults={defaults} accounts={accounts} categories={categories} />
    </Modal>
  );
}

function BillForm({ defaults, accounts, categories }: { defaults: BillDefaults; accounts: AccountOption[]; categories: CategoryOption[] }) {
  const [priority, setPriority] = useState<BillPriority>(defaults.priority ?? "important");
  const [canMove, setCanMove] = useState(defaults.canMove ?? false);
  const [due, setDue] = useState(defaults.dueDate ?? todayIST());
  const expense = categories.filter((c) => c.kind === "expense");
  return (
    <ActionForm action={saveBill} resetOnSuccess={!defaults.id}>
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input type="hidden" name="priority" value={priority} />
      <FormGrid cols={3}>
        <Field label="What for" className="sm:col-span-2">
          <Input name="title" required autoFocus defaultValue={defaults.title ?? ""} placeholder="e.g. Office rent, Car EMI, AWS" />
        </Field>
        <Field label="Kind">
          <Select name="kind" defaultValue={defaults.kind ?? "bill"}>
            {BILL_KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Amount">
          <MoneyInput name="amount" required defaultValue={paiseToInput(defaults.amountPaise)} placeholder="0" className="font-bold" />
        </Field>
        <Field label="Due date">
          <Input type="date" name="dueDate" required value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Pay to">
          <Input name="payee" defaultValue={defaults.payee ?? ""} placeholder="Landlord, bank, vendor" />
        </Field>
      </FormGrid>

      <div className="mt-5">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">Priority</div>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1" role="radiogroup" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button key={p.value} type="button" role="radio" aria-checked={priority === p.value} onClick={() => setPriority(p.value)} className={cn("flex flex-col items-center rounded-xl px-2 py-2 transition-all", priority === p.value ? p.on : "text-fg-muted hover:text-fg")}>
              <span className="text-sm font-bold">{p.label}</span>
              <span className={cn("hidden text-[10px] sm:block", priority === p.value ? "text-white/85" : "text-fg-subtle")}>{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-line p-4">
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-bold text-fg">Can this payment move?</span>
            <span className="text-xs text-fg-muted">The forecast can suggest pushing it when cash is tight.</span>
          </span>
          <input type="checkbox" name="canMove" checked={canMove} onChange={(e) => setCanMove(e.target.checked)} className="peer sr-only" />
          <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", canMove ? "bg-brand" : "bg-line-strong")} aria-hidden>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", canMove ? "left-[22px]" : "left-0.5")} />
          </span>
        </label>
        {canMove ? (
          <Field label="Latest safe date" className="mt-3 animate-fade-up" hint="The last day it can be paid without trouble">
            <Input type="date" name="latestDate" required min={due} defaultValue={defaults.latestDate ?? addDays(due, 7)} />
          </Field>
        ) : null}
      </div>

      <div className="mt-5">
        <RecurrenceFields value={defaults.recurrence} />
      </div>

      <FormGrid cols={3} className="mt-5">
        <Field label="Workspace">
          <Select name="workspace" defaultValue={defaults.workspace ?? "personal"}>
            {WORKSPACE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Pay from">
          <Select name="accountId" defaultValue={defaults.accountId ?? ""}>
            <option value="">Decide later</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select name="categoryId" defaultValue={defaults.categoryId ?? ""}>
            <option value="">None</option>
            {expense.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Remind me" hint="Days before, e.g. 3, 1">
          <Input name="remindDaysBefore" defaultValue={(defaults.remindDaysBefore ?? [3, 1]).join(", ")} placeholder="3, 1" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea name="notes" rows={1} defaultValue={defaults.notes ?? ""} placeholder="Account number, login hint…" />
        </Field>
      </FormGrid>

      <ModalActions>
        <SubmitButton pendingText="Saving…">{defaults.id ? "Save changes" : "Add to planner"}</SubmitButton>
      </ModalActions>
    </ActionForm>
  );
}
