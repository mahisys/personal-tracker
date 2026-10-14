import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import type { WorkspaceKey } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";
import { addMonths, formatDay } from "@/lib/dates";
import { markRenewed, saveRenewal } from "@/server/planner/actions";

export const RENEWAL_KINDS = ["Passport", "Driving licence", "Vehicle insurance", "PUC", "Health insurance", "Life insurance", "Vehicle RC", "GST registration", "Trade licence", "Shop & establishment", "Domain / hosting", "Professional tax", "Other"];

export type RenewalDefaults = {
  id?: string;
  name?: string;
  kind?: string | null;
  number?: string | null;
  expiresOn?: string;
  remindDaysBefore?: number;
  notes?: string;
  workspace?: WorkspaceKey;
};

export function RenewalDialog({ trigger, defaults = {}, variant = "primary", size = "md", triggerClassName, defaultOpen }: { trigger: ReactNode; defaults?: RenewalDefaults; variant?: ButtonVariant; size?: ButtonSize; triggerClassName?: string; defaultOpen?: boolean }) {
  return (
    <Modal trigger={trigger} title={defaults.id ? "Edit renewal" : "Track an expiry"} description="We'll remind you well before it lapses." variant={variant} size={size} triggerClassName={triggerClassName} defaultOpen={defaultOpen}>
      <ActionForm action={saveRenewal} resetOnSuccess={!defaults.id}>
        {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
        <FormGrid>
          <Field label="Name" className="sm:col-span-2">
            <Input name="name" required autoFocus defaultValue={defaults.name ?? ""} placeholder="e.g. Car insurance — Creta" />
          </Field>
          <Field label="Type">
            <Input name="kind" list="renewal-kinds" defaultValue={defaults.kind ?? ""} placeholder="Vehicle insurance" />
            <datalist id="renewal-kinds">
              {RENEWAL_KINDS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>
          <Field label="Number / policy no.">
            <Input name="number" defaultValue={defaults.number ?? ""} placeholder="Optional" />
          </Field>
          <Field label="Expires on">
            <Input type="date" name="expiresOn" required defaultValue={defaults.expiresOn ?? ""} />
          </Field>
          <Field label="Remind me" hint="Days before expiry">
            <Input type="number" name="remindDaysBefore" min={0} max={365} defaultValue={defaults.remindDaysBefore ?? 30} />
          </Field>
          <Field label="Workspace">
            <Select name="workspace" defaultValue={defaults.workspace ?? "personal"}>
              {WORKSPACE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea name="notes" rows={2} defaultValue={defaults.notes ?? ""} placeholder="Agent, portal, documents needed…" />
          </Field>
        </FormGrid>
        <ModalActions>
          <SubmitButton pendingText="Saving…">{defaults.id ? "Save changes" : "Start tracking"}</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );
}

export function RenewDialog({ id, name, expiresOn, number }: { id: string; name: string; expiresOn: string; number: string | null }) {
  return (
    <Modal trigger={<><RefreshCw className="h-3.5 w-3.5" /> Mark renewed</>} title={`Renewed ${name}?`} description={`It was valid until ${formatDay(expiresOn)}. When does the new one expire?`} variant="success" size="sm">
      <ActionForm action={markRenewed}>
        <input type="hidden" name="id" value={id} />
        <FormGrid>
          <Field label="New expiry date">
            <Input type="date" name="expiresOn" required min={expiresOn} defaultValue={addMonths(expiresOn, 12)} />
          </Field>
          <Field label="New number (if changed)">
            <Input name="number" placeholder={number ?? "Optional"} />
          </Field>
        </FormGrid>
        <ModalActions>
          <SubmitButton variant="success" pendingText="Saving…">Mark renewed</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );
}
