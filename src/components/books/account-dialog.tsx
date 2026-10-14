"use client";
import { useState, type ReactNode } from "react";
import { ACCOUNT_TYPES, type AccountType, type WorkspaceKey } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, MoneyInput, Select } from "@/components/ui/form";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";
import { paiseToInput } from "@/lib/money";
import { todayIST } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { saveAccount } from "@/server/books/actions";

const LABELS: Record<AccountType, string> = { bank: "Bank", cash: "Cash", upi: "UPI", wallet: "Wallet", credit_card: "Credit card", loan: "Loan" };

export type AccountDefaults = {
  id?: string;
  name?: string;
  type?: AccountType;
  workspace?: WorkspaceKey | null;
  institution?: string | null;
  last4?: string | null;
  openingBalancePaise?: number;
  openingDate?: string;
  creditLimitPaise?: number | null;
};

export function AccountDialog({
  trigger,
  defaults = {},
  variant = "primary",
  size = "md",
  triggerClassName,
  defaultOpen,
}: {
  trigger: ReactNode;
  defaults?: AccountDefaults;
  variant?: ButtonVariant;
  size?: ButtonSize;
  triggerClassName?: string;
  defaultOpen?: boolean;
}) {
  return (
    <Modal trigger={trigger} title={defaults.id ? "Edit account" : "Add an account"} description="Bank, cash, UPI, wallet, credit card or loan." variant={variant} size={size} triggerClassName={triggerClassName} defaultOpen={defaultOpen}>
      <AccountForm defaults={defaults} />
    </Modal>
  );
}

function AccountForm({ defaults }: { defaults: AccountDefaults }) {
  const [type, setType] = useState<AccountType>(defaults.type ?? "bank");
  const debt = type === "credit_card" || type === "loan";
  // Debt accounts show what you owe as a positive number.
  const opening = defaults.openingBalancePaise ?? null;
  const openingShown = debt && opening != null && opening !== 0 ? -opening : opening;
  return (
    <ActionForm action={saveAccount} resetOnSuccess={!defaults.id}>
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input type="hidden" name="type" value={type} />
      <div className="mb-5 grid grid-cols-3 gap-1.5 sm:grid-cols-6" role="radiogroup" aria-label="Account type">
        {ACCOUNT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={cn("h-9 rounded-xl text-xs font-bold transition", type === t ? "bg-brand text-white shadow-md" : "bg-muted text-fg-muted hover:bg-brand-soft hover:text-fg")}
          >
            {LABELS[t]}
          </button>
        ))}
      </div>
      <FormGrid>
        <Field label="Name" className="sm:col-span-2">
          <Input name="name" required autoFocus defaultValue={defaults.name ?? ""} placeholder={debt ? "e.g. HDFC Regalia" : "e.g. HDFC Current"} />
        </Field>
        <Field label={type === "upi" || type === "wallet" ? "Provider" : "Bank / institution"}>
          <Input name="institution" defaultValue={defaults.institution ?? ""} placeholder={type === "upi" ? "PhonePe, GPay…" : "HDFC, SBI…"} />
        </Field>
        <Field label="Last digits" hint="Optional, helps you recognise it">
          <Input name="last4" inputMode="numeric" maxLength={6} defaultValue={defaults.last4 ?? ""} placeholder="1234" />
        </Field>
        <Field label={debt ? "Owed on opening date" : "Opening balance"} hint={debt ? "What you owed then (negative if in credit)" : "Balance on the opening date"}>
          <MoneyInput name="openingBalance" defaultValue={paiseToInput(openingShown)} placeholder="0" />
        </Field>
        <Field label="Opening date">
          <Input type="date" name="openingDate" defaultValue={defaults.openingDate ?? todayIST()} />
        </Field>
        {debt ? (
          <>
            <input type="hidden" name="owed" value="on" />
            <Field label={type === "loan" ? "Loan amount" : "Credit limit"} hint="Optional">
              <MoneyInput name="creditLimit" defaultValue={paiseToInput(defaults.creditLimitPaise)} placeholder="0" />
            </Field>
          </>
        ) : null}
        <Field label="Workspace" hint="Shared accounts appear everywhere">
          <Select name="workspace" defaultValue={defaults.workspace ?? ""}>
            <option value="">Shared (all)</option>
            {WORKSPACE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <ModalActions>
        <SubmitButton pendingText="Saving…">{defaults.id ? "Save changes" : "Add account"}</SubmitButton>
      </ModalActions>
    </ActionForm>
  );
}
