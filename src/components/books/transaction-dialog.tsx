"use client";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronDown } from "lucide-react";
import type { AccountType, TransactionType, WorkspaceKey } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";
import { paiseToInput } from "@/lib/money";
import { todayIST } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { saveTransaction } from "@/server/books/actions";

export type AccountOption = { id: string; name: string; type: AccountType; workspace: WorkspaceKey | null; last4?: string | null };
export type CategoryOption = { id: string; name: string; kind: "income" | "expense"; workspace: WorkspaceKey | null };

export type TxnDefaults = {
  id?: string;
  type?: TransactionType;
  date?: string;
  workspace?: WorkspaceKey;
  accountId?: string;
  transferAccountId?: string | null;
  amountPaise?: number;
  categoryId?: string | null;
  party?: string | null;
  description?: string;
  gstPaise?: number;
  tdsPaise?: number;
  reference?: string | null;
};

const TYPES: { value: TransactionType; label: string; icon: typeof ArrowUpRight; on: string }[] = [
  { value: "expense", label: "Expense", icon: ArrowUpRight, on: "bg-rose-500 text-white shadow-[0_6px_16px_-6px_#f43f5e]" },
  { value: "income", label: "Income", icon: ArrowDownLeft, on: "bg-emerald-500 text-white shadow-[0_6px_16px_-6px_#10b981]" },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight, on: "bg-brand text-white shadow-[0_6px_16px_-6px_var(--brand)]" },
];

function accountLabel(a: AccountOption) {
  return a.last4 ? `${a.name} ••${a.last4}` : a.name;
}

/** Add or edit an income, expense or transfer in a modal. */
export function TransactionDialog({
  trigger,
  title,
  description,
  accounts,
  categories,
  defaults = {},
  variant = "primary",
  size = "md",
  triggerClassName,
  defaultOpen,
  lockType,
}: {
  trigger: ReactNode;
  title?: string;
  description?: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaults?: TxnDefaults;
  variant?: ButtonVariant;
  size?: ButtonSize;
  triggerClassName?: string;
  defaultOpen?: boolean;
  /** Hide the type switch (e.g. for a transfer-only dialog) */
  lockType?: boolean;
}) {
  const editing = !!defaults.id;
  return (
    <Modal
      trigger={trigger}
      title={title ?? (editing ? "Edit entry" : "Add an entry")}
      description={description}
      variant={variant}
      size={size}
      triggerClassName={triggerClassName}
      defaultOpen={defaultOpen}
    >
      <TransactionFormBody accounts={accounts} categories={categories} defaults={defaults} lockType={lockType} />
    </Modal>
  );
}

function TransactionFormBody({ accounts, categories, defaults, lockType }: { accounts: AccountOption[]; categories: CategoryOption[]; defaults: TxnDefaults; lockType?: boolean }) {
  const [type, setType] = useState<TransactionType>(defaults.type ?? "expense");
  const [ws, setWs] = useState<WorkspaceKey>(defaults.workspace ?? "personal");
  const [accountId, setAccountId] = useState(defaults.accountId ?? accounts[0]?.id ?? "");
  const [showTax, setShowTax] = useState(!!(defaults.gstPaise || defaults.tdsPaise || defaults.reference));
  const editing = !!defaults.id;

  const cats = useMemo(
    () => categories.filter((c) => c.kind === type && (c.workspace == null || c.workspace === ws || c.id === defaults.categoryId)),
    [categories, type, ws, defaults.categoryId],
  );
  const accts = useMemo(() => accounts.filter((a) => a.workspace == null || a.workspace === ws || a.id === defaults.accountId || a.id === defaults.transferAccountId), [accounts, ws, defaults.accountId, defaults.transferAccountId]);
  const selectedAccount = accts.some((a) => a.id === accountId) ? accountId : (accts[0]?.id ?? "");
  const toAccounts = accts.filter((a) => a.id !== selectedAccount);

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl bg-muted p-5 text-sm text-fg-muted">
        Add an account first — <Link className="font-semibold text-brand" href="/books/accounts?new=1">create one</Link> for your bank, cash or card.
      </div>
    );
  }

  return (
    <ActionForm action={saveTransaction} resetOnSuccess={!editing}>
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input type="hidden" name="type" value={type} />
      {!lockType ? (
        <div role="radiogroup" aria-label="Type" className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const on = type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setType(t.value)}
                className={cn("flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition-all", on ? t.on : "text-fg-muted hover:text-fg")}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <FormGrid>
        <Field label="Amount">
          <MoneyInput name="amount" required autoFocus defaultValue={paiseToInput(defaults.amountPaise)} placeholder="0" className="text-lg font-bold" />
        </Field>
        <Field label="Date">
          <Input type="date" name="date" required defaultValue={defaults.date ?? todayIST()} />
        </Field>
        <Field label={type === "transfer" ? "From account" : type === "income" ? "Into account" : "Paid from"}>
          <Select name="accountId" value={selectedAccount} onChange={(e) => setAccountId(e.target.value)} required>
            {accts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a)}
              </option>
            ))}
          </Select>
        </Field>
        {type === "transfer" ? (
          <Field label="To account">
            <Select name="transferAccountId" defaultValue={defaults.transferAccountId ?? toAccounts[0]?.id ?? ""} required key={selectedAccount}>
              {toAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Category">
            <Select name="categoryId" defaultValue={defaults.categoryId ?? ""} key={`${type}-${ws}`}>
              <option value="">Uncategorised</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Workspace">
          <Select name="workspace" value={ws} onChange={(e) => setWs(e.target.value as WorkspaceKey)}>
            {WORKSPACE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        {type !== "transfer" ? (
          <Field label={type === "income" ? "From (party)" : "Paid to (party)"}>
            <Input name="party" defaultValue={defaults.party ?? ""} placeholder={type === "income" ? "Client or lender" : "Shop, vendor, person"} />
          </Field>
        ) : null}
        <Field label="Note" className="sm:col-span-2">
          <Textarea name="description" rows={2} defaultValue={defaults.description ?? ""} placeholder="What was it for?" />
        </Field>
      </FormGrid>

      {type !== "transfer" ? (
        <div className="mt-4">
          <button type="button" onClick={() => setShowTax((s) => !s)} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-fg-muted transition hover:text-brand">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showTax && "rotate-180")} />
            GST, TDS &amp; reference
          </button>
          <div inert={!showTax} className={cn("grid grid-cols-1 gap-4 overflow-hidden transition-all duration-300 sm:grid-cols-3", showTax ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0")}>
            <Field label="GST included" hint="Input tax credit you can claim">
              <MoneyInput name="gst" defaultValue={paiseToInput(defaults.gstPaise || null)} placeholder="0" />
            </Field>
            <Field label="TDS deducted" hint={type === "income" ? "Deducted by the payer" : "You deducted"}>
              <MoneyInput name="tds" defaultValue={paiseToInput(defaults.tdsPaise || null)} placeholder="0" />
            </Field>
            <Field label="Reference">
              <Input name="reference" defaultValue={defaults.reference ?? ""} placeholder="UTR / cheque no." />
            </Field>
          </div>
        </div>
      ) : null}

      <ModalActions>
        <SubmitButton variant={type === "income" ? "success" : "primary"} pendingText="Saving…">
          {editing ? "Save changes" : type === "income" ? "Add income" : type === "transfer" ? "Move money" : "Add expense"}
        </SubmitButton>
      </ModalActions>
    </ActionForm>
  );
}
