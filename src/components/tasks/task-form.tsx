"use client";
import { useEffect, useId, useState, useTransition } from "react";
import { Link2, Loader2, Search, X } from "lucide-react";
import type { LinkedEntityType, Recurrence, TaskStatus, WorkspaceKey } from "@/db/schema";
import { saveTask, searchLinkTargets } from "@/server/tasks/actions";
import type { ProjectOption } from "@/server/tasks/queries";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ModalActions } from "@/components/client/modal";
import { RecurrenceFields } from "@/components/client/recurrence-fields";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { toDateTimeLocalIST } from "@/lib/dates";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";
import { LINK_META, PRIORITY_META, splitMinutes, STATUS_META, TASK_TYPE_SUGGESTIONS } from "./meta";

export type TaskFormValues = {
  id?: string;
  title?: string;
  description?: string;
  workspace?: WorkspaceKey;
  projectId?: string | null;
  milestoneId?: string | null;
  parentTaskId?: string | null;
  status?: TaskStatus;
  priority?: number;
  taskType?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  /** ISO string */
  remindAt?: string | null;
  estimateMinutes?: number | null;
  recurrence?: Recurrence | null;
  linkedType?: LinkedEntityType | null;
  linkedId?: string | null;
  linkedLabel?: string | null;
  tags?: string[];
};

export function TaskForm({
  values = {},
  projects,
  taskTypes = [],
  submitLabel,
}: {
  values?: TaskFormValues;
  projects: ProjectOption[];
  taskTypes?: string[];
  submitLabel?: string;
}) {
  const uid = useId();
  const editing = !!values.id;
  const [projectId, setProjectId] = useState(values.projectId ?? "");
  const [priority, setPriority] = useState(values.priority ?? 3);
  const [dueDate, setDueDate] = useState(values.dueDate ?? "");
  const project = projects.find((p) => p.id === projectId);
  const est = splitMinutes(values.estimateMinutes);
  const types = [...new Set([...taskTypes, ...TASK_TYPE_SUGGESTIONS])];

  return (
    <ActionForm action={saveTask} className="space-y-5" resetOnSuccess={!editing}>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {values.parentTaskId ? <input type="hidden" name="parentTaskId" value={values.parentTaskId} /> : null}
      <input type="hidden" name="priority" value={priority} />

      <Field label="What needs doing?">
        <Input name="title" required autoFocus={!editing} defaultValue={values.title} placeholder="e.g. Send proposal to Sharma Traders" maxLength={300} />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Priority</span>
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Priority">
          {[1, 2, 3, 4].map((p) => {
            const on = p === priority;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPriority(p)}
                className={cn(
                  "h-10 rounded-xl border text-xs font-bold transition-all",
                  on ? cn("border-transparent shadow-sm ring-2 ring-current/30", PRIORITY_META[p].className) : "border-line-strong text-fg-muted hover:bg-muted",
                )}
              >
                {PRIORITY_META[p].label.replace(" · ", " ")}
              </button>
            );
          })}
        </div>
      </div>

      <FormGrid cols={3}>
        <Field label="Due date">
          <Input type="date" name="dueDate" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Time (optional)">
          <Input type="time" name="dueTime" defaultValue={values.dueTime ?? ""} disabled={!dueDate} />
        </Field>
        <Field label="Estimate">
          <div className="flex items-center gap-1.5">
            <Input type="number" name="estH" min={0} step={1} inputMode="numeric" placeholder="0" defaultValue={est.h} aria-label="Estimate hours" className="px-2 text-center" />
            <span className="text-xs font-bold text-fg-subtle">h</span>
            <Input type="number" name="estM" min={0} max={59} step={5} inputMode="numeric" placeholder="30" defaultValue={est.m} aria-label="Estimate minutes" className="px-2 text-center" />
            <span className="text-xs font-bold text-fg-subtle">m</span>
          </div>
        </Field>
      </FormGrid>

      <FormGrid>
        <Field label="Project">
          <Select name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {project && project.milestones.length > 0 ? (
          <Field label="Milestone">
            <Select name="milestoneId" defaultValue={values.milestoneId ?? ""}>
              <option value="">None</option>
              {project.milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Workspace" hint={project ? "Follows the project" : undefined}>
            <Select key={project?.id ?? "none"} name="workspace" defaultValue={project?.workspace ?? values.workspace ?? "mahisys"} disabled={!!project}>
              {WORKSPACE_OPTIONS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </FormGrid>
      {project && project.milestones.length > 0 ? <input type="hidden" name="workspace" value={project.workspace} /> : null}

      <FormGrid>
        <Field label="Type" hint="Used to learn how accurate your estimates are">
          <Input name="taskType" list={`${uid}-types`} defaultValue={values.taskType ?? ""} placeholder="development, sales call…" />
          <datalist id={`${uid}-types`}>
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        {editing ? (
          <Field label="Status">
            <Select name="status" defaultValue={values.status ?? "todo"}>
              {(["todo", "doing", "waiting", "done", "cancelled"] as const).map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Remind me (optional)">
            <Input type="datetime-local" name="remindAt" defaultValue={toDateTimeLocalIST(values.remindAt ? new Date(values.remindAt) : null)} />
          </Field>
        )}
      </FormGrid>
      {editing ? (
        <Field label="Remind me (optional)">
          <Input type="datetime-local" name="remindAt" defaultValue={toDateTimeLocalIST(values.remindAt ? new Date(values.remindAt) : null)} />
        </Field>
      ) : null}

      <LinkPicker type={values.linkedType ?? null} id={values.linkedId ?? null} label={values.linkedLabel ?? null} />

      <Field label="Notes">
        <Textarea name="description" rows={3} defaultValue={values.description} placeholder="Context, links, the first small step…" />
      </Field>

      <Field label="Tags" hint="Comma separated">
        <Input name="tags" defaultValue={values.tags?.join(", ")} placeholder="urgent, gst, follow-up" />
      </Field>

      <div className="rounded-2xl border border-line bg-muted/40 p-4">
        <RecurrenceFields value={values.recurrence ?? null} />
      </div>

      <ModalActions>
        <SubmitButton pendingText="Saving…">{submitLabel ?? (editing ? "Save changes" : "Add task")}</SubmitButton>
      </ModalActions>
    </ActionForm>
  );
}

/** Pick a CRM / invoice / DSA / bill record to link the task to. */
function LinkPicker({ type: initialType, id: initialId, label: initialLabel }: { type: LinkedEntityType | null; id: string | null; label: string | null }) {
  const [type, setType] = useState<LinkedEntityType | "">(initialType ?? "");
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(initialId ? { id: initialId, label: initialLabel ?? "Linked record" } : null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; label: string; sub?: string | null }[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!type || selected) return;
    const t = setTimeout(() => start(async () => setResults(await searchLinkTargets(type, q))), 220);
    return () => clearTimeout(t);
  }, [type, q, selected]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        <Link2 className="h-3.5 w-3.5" /> Linked to
      </span>
      <input type="hidden" name="linkedType" value={selected ? type : ""} />
      <input type="hidden" name="linkedId" value={selected?.id ?? ""} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          aria-label="Record type"
          value={type}
          onChange={(e) => {
            setType(e.target.value as LinkedEntityType | "");
            setSelected(null);
            setQ("");
            setResults([]);
          }}
          className="sm:w-40"
        >
          <option value="">Nothing</option>
          {(Object.keys(LINK_META) as LinkedEntityType[]).map((k) => (
            <option key={k} value={k}>
              {LINK_META[k].label}
            </option>
          ))}
        </Select>
        {type && selected ? (
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-sm font-semibold text-sky-800 dark:text-sky-200">
            <span className="min-w-0 flex-1 truncate">{selected.label}</span>
            <button type="button" onClick={() => setSelected(null)} className="rounded-full p-0.5 hover:bg-sky-500/20" aria-label="Remove link">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : type ? (
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${LINK_META[type].label.toLowerCase()}s…`} className="pl-9" />
            {pending ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-fg-subtle" /> : null}
          </div>
        ) : null}
      </div>
      {type && !selected ? (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-line bg-solid">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-fg-subtle">{pending ? "Searching…" : q ? "No matches" : `No ${LINK_META[type].label.toLowerCase()}s yet`}</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected({ id: r.id, label: r.label })}
                className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-brand-soft"
              >
                <span className="truncate font-semibold text-fg">{r.label}</span>
                {r.sub ? <span className="shrink-0 text-xs text-fg-subtle">{r.sub}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
