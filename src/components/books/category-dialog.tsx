import type { ReactNode } from "react";
import type { WorkspaceKey } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";
import { paiseToInput } from "@/lib/money";
import { saveCategory } from "@/server/books/actions";

export type CategoryDefaults = {
  id?: string;
  name?: string;
  kind?: "income" | "expense";
  workspace?: WorkspaceKey | null;
  monthlyBudgetPaise?: number | null;
  matchKeywords?: string[];
};

export function CategoryDialog({
  trigger,
  defaults = {},
  variant = "primary",
  size = "md",
  triggerClassName,
}: {
  trigger: ReactNode;
  defaults?: CategoryDefaults;
  variant?: ButtonVariant;
  size?: ButtonSize;
  triggerClassName?: string;
}) {
  return (
    <Modal trigger={trigger} title={defaults.id ? "Edit category" : "New category"} description="Group entries, set a monthly budget and teach the importer." variant={variant} size={size} triggerClassName={triggerClassName}>
      <ActionForm action={saveCategory} resetOnSuccess={!defaults.id}>
        {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
        <FormGrid>
          <Field label="Name" className="sm:col-span-2">
            <Input name="name" required autoFocus defaultValue={defaults.name ?? ""} placeholder="e.g. Software & subscriptions" />
          </Field>
          <Field label="Kind">
            <Select name="kind" defaultValue={defaults.kind ?? "expense"}>
              <option value="expense">Expense (money out)</option>
              <option value="income">Income (money in)</option>
            </Select>
          </Field>
          <Field label="Workspace">
            <Select name="workspace" defaultValue={defaults.workspace ?? ""}>
              <option value="">All workspaces</option>
              {WORKSPACE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Monthly budget" hint="Optional — expenses only" className="sm:col-span-2">
            <MoneyInput name="budget" defaultValue={paiseToInput(defaults.monthlyBudgetPaise)} placeholder="No budget" />
          </Field>
          <Field label="Auto-match keywords" hint="Comma separated. Bank lines containing any of these get this category on import." className="sm:col-span-2">
            <Textarea name="keywords" rows={2} defaultValue={(defaults.matchKeywords ?? []).join(", ")} placeholder="swiggy, zomato, cafe" />
          </Field>
        </FormGrid>
        <ModalActions>
          <SubmitButton pendingText="Saving…">{defaults.id ? "Save changes" : "Add category"}</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );
}
