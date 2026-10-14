"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { ProjectStatus, WorkspaceKey } from "@/db/schema";
import { saveProject } from "@/server/tasks/project-actions";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { paiseToInput } from "@/lib/money";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";
import { PROJECT_STATUS_META } from "./meta";

export type ProjectFormValues = {
  id?: string;
  name?: string;
  description?: string;
  workspace?: WorkspaceKey;
  status?: ProjectStatus;
  companyId?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  budgetHours?: number | null;
  valuePaise?: number | null;
};

type Company = { id: string; name: string; workspace: WorkspaceKey };

function ProjectForm({ values = {}, companies }: { values?: ProjectFormValues; companies: Company[] }) {
  const [ws, setWs] = useState<WorkspaceKey>(values.workspace ?? "mahisys");
  const editing = !!values.id;
  const visible = companies.filter((c) => c.workspace === ws || c.id === values.companyId);
  return (
    <ActionForm action={saveProject} className="space-y-5" resetOnSuccess={!editing}>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <Field label="Project name">
        <Input name="name" required autoFocus={!editing} defaultValue={values.name} placeholder="e.g. Website revamp for Sharma Traders" />
      </Field>
      <FormGrid>
        <Field label="Workspace">
          <Select name="workspace" value={ws} onChange={(e) => setWs(e.target.value as WorkspaceKey)}>
            {WORKSPACE_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={values.status ?? "active"}>
            {(Object.keys(PROJECT_STATUS_META) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      <Field label="Client (optional)">
        <Select name="companyId" defaultValue={values.companyId ?? ""}>
          <option value="">No client</option>
          {visible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <FormGrid>
        <Field label="Start date">
          <Input type="date" name="startDate" defaultValue={values.startDate ?? ""} />
        </Field>
        <Field label="Deadline" hint="Drives the On track / At risk badge">
          <Input type="date" name="deadline" defaultValue={values.deadline ?? ""} />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Budget (hours)">
          <Input type="number" name="budgetHours" min={0} step={0.5} inputMode="decimal" defaultValue={values.budgetHours ?? ""} placeholder="40" />
        </Field>
        <Field label="Value">
          <MoneyInput name="value" defaultValue={paiseToInput(values.valuePaise)} placeholder="1,50,000" />
        </Field>
      </FormGrid>
      <Field label="Description">
        <Textarea name="description" rows={3} defaultValue={values.description} placeholder="What does done look like?" />
      </Field>
      <ModalActions>
        <SubmitButton pendingText="Saving…">{editing ? "Save project" : "Create project"}</SubmitButton>
      </ModalActions>
    </ActionForm>
  );
}

export function NewProjectButton({ companies, defaultWorkspace, label = "New project" }: { companies: Company[]; defaultWorkspace?: WorkspaceKey; label?: string }) {
  return (
    <Modal
      trigger={
        <>
          <Plus className="h-4 w-4" /> {label}
        </>
      }
      title="New project"
      description="Group tasks, track time and see if you'll make the deadline."
      wide
    >
      <ProjectForm companies={companies} values={{ workspace: defaultWorkspace }} />
    </Modal>
  );
}

export function EditProjectButton({ values, companies }: { values: ProjectFormValues; companies: Company[] }) {
  return (
    <Modal
      trigger={
        <>
          <Pencil className="h-4 w-4" /> Edit
        </>
      }
      title="Edit project"
      variant="secondary"
      wide
    >
      <ProjectForm companies={companies} values={values} />
    </Modal>
  );
}
