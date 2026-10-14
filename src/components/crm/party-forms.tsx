import type { companies, contacts, WorkspaceKey } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { saveCompany, saveContact } from "@/server/crm/actions";
import { LEAD_SOURCES } from "@/server/crm/pipeline";
import { INDIAN_STATES } from "@/lib/gst";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";

type Contact = typeof contacts.$inferSelect;
type Company = typeof companies.$inferSelect;

function WorkspaceField({ value }: { value: WorkspaceKey }) {
  return (
    <Field label="Workspace">
      <Select name="workspace" defaultValue={value}>
        {WORKSPACE_OPTIONS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function ContactForm({ contact, companyName, workspace, companyNames, redirectToDetail }: { contact?: Contact; companyName?: string | null; workspace: WorkspaceKey; companyNames: string[]; redirectToDetail?: boolean }) {
  const uid = contact?.id ?? "new";
  return (
    <ActionForm action={saveContact}>
      {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
      {redirectToDetail ? <input type="hidden" name="redirect" value="detail" /> : null}
      <datalist id={`co-${uid}`}>
        {companyNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id={`src-${uid}`}>
        {LEAD_SOURCES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <FormGrid>
        <Field label="Name">
          <Input name="name" defaultValue={contact?.name} required autoFocus={!contact} placeholder="Full name" />
        </Field>
        <Field label="Company" hint="Type a new name to add it">
          <Input name="companyName" list={`co-${uid}`} defaultValue={companyName ?? ""} autoComplete="off" />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" inputMode="tel" defaultValue={contact?.phone ?? ""} placeholder="98xxxxxx10" />
        </Field>
        <Field label="WhatsApp" hint="Leave blank if same as phone">
          <Input name="whatsapp" type="tel" inputMode="tel" defaultValue={contact?.whatsapp ?? ""} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={contact?.email ?? ""} />
        </Field>
        <Field label="Role">
          <Input name="role" defaultValue={contact?.role ?? ""} placeholder="Owner, CFO, Purchase…" />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={contact?.city ?? ""} />
        </Field>
        <Field label="Source">
          <Input name="source" list={`src-${uid}`} defaultValue={contact?.source ?? ""} autoComplete="off" />
        </Field>
        <WorkspaceField value={contact?.workspace ?? workspace} />
        <Field label="Notes" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={contact?.notes ?? ""} rows={2} />
        </Field>
      </FormGrid>
      <ModalActions>
        <SubmitButton pendingText="Saving…">{contact ? "Save contact" : "Add contact"}</SubmitButton>
      </ModalActions>
    </ActionForm>
  );
}

export function CompanyForm({ company, workspace, redirectToDetail }: { company?: Company; workspace: WorkspaceKey; redirectToDetail?: boolean }) {
  return (
    <ActionForm action={saveCompany}>
      {company ? <input type="hidden" name="id" value={company.id} /> : null}
      {redirectToDetail ? <input type="hidden" name="redirect" value="detail" /> : null}
      <FormGrid>
        <Field label="Company name" className="sm:col-span-2">
          <Input name="name" defaultValue={company?.name} required autoFocus={!company} placeholder="As registered" />
        </Field>
        <Field label="GSTIN" hint="State is picked up from the GSTIN automatically">
          <Input name="gstin" defaultValue={company?.gstin ?? ""} maxLength={15} className="uppercase" placeholder="27ABCDE1234F1Z5" pattern="[0-9A-Za-z]{15}" title="15 characters, e.g. 27ABCDE1234F1Z5" />
        </Field>
        <Field label="State" hint="Used as the place of supply on invoices">
          <Select name="stateCode" defaultValue={company?.stateCode ?? ""}>
            <option value="">— Select —</option>
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} · {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Industry">
          <Input name="industry" defaultValue={company?.industry ?? ""} placeholder="Manufacturing, retail…" />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={company?.city ?? ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" defaultValue={company?.phone ?? ""} />
        </Field>
        <Field label="Accounts email">
          <Input name="email" type="email" defaultValue={company?.email ?? ""} />
        </Field>
        <Field label="Website">
          <Input name="website" defaultValue={company?.website ?? ""} placeholder="example.in" />
        </Field>
        <WorkspaceField value={company?.workspace ?? workspace} />
        <Field label="Billing address" className="sm:col-span-2">
          <Textarea name="address" defaultValue={company?.address ?? ""} rows={2} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={company?.notes ?? ""} rows={2} />
        </Field>
      </FormGrid>
      <ModalActions>
        <SubmitButton pendingText="Saving…">{company ? "Save company" : "Add company"}</SubmitButton>
      </ModalActions>
    </ActionForm>
  );
}
