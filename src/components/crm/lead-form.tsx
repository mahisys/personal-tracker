import type { WorkspaceKey } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { saveLead } from "@/server/crm/actions";
import { LEAD_SOURCES, followUpInDays } from "@/server/crm/pipeline";
import { toDateTimeLocalIST, todayIST } from "@/lib/dates";
import { paiseToInput } from "@/lib/money";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";

type Lead = {
  id: string;
  title: string;
  workspace: WorkspaceKey;
  valuePaise: number;
  probability: number;
  expectedCloseDate: string | null;
  source: string | null;
  nextFollowUpAt: Date | null;
  notes: string;
};

/** Create/edit form for a lead. Typing a new company or contact name creates it. */
export function LeadForm({
  lead,
  companyName,
  contactName,
  workspace,
  stages,
  options,
  redirectToDetail,
}: {
  lead?: Lead;
  companyName?: string | null;
  contactName?: string | null;
  workspace: WorkspaceKey;
  stages?: { id: string; name: string; kind: string }[];
  options: { companies: { id: string; name: string }[]; contacts: { id: string; name: string }[] };
  redirectToDetail?: boolean;
}) {
  const uid = lead?.id ?? "new";
  return (
    <ActionForm action={saveLead}>
      {lead ? <input type="hidden" name="id" value={lead.id} /> : null}
      {redirectToDetail ? <input type="hidden" name="redirect" value="detail" /> : null}
      <datalist id={`companies-${uid}`}>
        {options.companies.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <datalist id={`contacts-${uid}`}>
        {options.contacts.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <datalist id={`sources-${uid}`}>
        {LEAD_SOURCES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <FormGrid>
        <Field label="What's the opportunity?" className="sm:col-span-2">
          <Input name="title" defaultValue={lead?.title} placeholder="e.g. Website revamp for Sharma Traders" required autoFocus={!lead} />
        </Field>
        <Field label="Company" hint="Pick one or type a new name">
          <Input name="companyName" list={`companies-${uid}`} defaultValue={companyName ?? ""} placeholder="Company name" autoComplete="off" />
        </Field>
        <Field label="Contact person" hint="New names are added to contacts">
          <Input name="contactName" list={`contacts-${uid}`} defaultValue={contactName ?? ""} placeholder="Who you're talking to" autoComplete="off" />
        </Field>
        {!lead ? (
          <>
            <Field label="Phone (new contact)">
              <Input name="phone" type="tel" inputMode="tel" placeholder="98xxxxxx10" />
            </Field>
            <Field label="Email (new contact)">
              <Input name="email" type="email" placeholder="name@company.in" />
            </Field>
          </>
        ) : null}
        <Field label="Deal value">
          <MoneyInput name="value" defaultValue={paiseToInput(lead?.valuePaise || null)} placeholder="0" />
        </Field>
        {lead ? (
          <Field label="Win probability %">
            <Input name="probability" type="number" min={0} max={100} defaultValue={lead.probability} />
          </Field>
        ) : stages?.length ? (
          <Field label="Stage">
            <Select name="stageId" defaultValue={stages.find((s) => s.kind === "open")?.id}>
              {stages
                .filter((s) => s.kind === "open")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Source">
          <Input name="source" list={`sources-${uid}`} defaultValue={lead?.source ?? ""} placeholder="Referral, website…" autoComplete="off" />
        </Field>
        <Field label="Expected close">
          <Input type="date" name="expectedCloseDate" defaultValue={lead?.expectedCloseDate ?? ""} />
        </Field>
        {!lead ? (
          <Field label="First follow-up">
            <Input type="datetime-local" name="nextFollowUp" defaultValue={toDateTimeLocalIST(followUpInDays(1, todayIST()))} />
          </Field>
        ) : null}
        <Field label="Workspace">
          <Select name="workspace" defaultValue={lead?.workspace ?? workspace}>
            {WORKSPACE_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={lead?.notes ?? ""} rows={3} placeholder="Requirements, budget, decision makers…" />
        </Field>
      </FormGrid>
      <ModalActions>
        <SubmitButton pendingText="Saving…">{lead ? "Save changes" : "Add lead"}</SubmitButton>
      </ModalActions>
    </ActionForm>
  );
}
