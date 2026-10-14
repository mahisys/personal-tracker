"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowLeftRight, MapPin, Plus, Trash2 } from "lucide-react";
import type { ActionResult } from "@/lib/action";
import type { WorkspaceKey } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { addDays } from "@/lib/dates";
import { INDIAN_STATES, lineTaxable } from "@/lib/gst";
import { formatINR } from "@/lib/money";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";
import { cn } from "@/lib/cn";
import { GST_RATE_OPTIONS, editorTotalsFor, emptyRow, rowToLine, type EditorRow } from "@/server/invoices/lines";

export type CompanyOpt = { id: string; name: string; gstin: string | null; stateCode: string | null; address: string; city: string | null; email: string | null; workspace: WorkspaceKey };
export type ContactOpt = { id: string; name: string; companyId: string | null; email: string | null };
export type ProjectOpt = { id: string; name: string; companyId: string | null };
export type LeadOpt = { id: string; title: string; companyId: string | null; contactId: string | null };

export type DocumentInitial = {
  id?: string;
  workspace: WorkspaceKey;
  companyId?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  leadId?: string | null;
  billTo?: { name: string; gstin?: string | null; address?: string; stateCode?: string | null; email?: string | null };
  issueDate: string;
  /** Due date (invoice) or valid-until (quote) */
  endDate?: string | null;
  placeOfSupply?: string | null;
  notes?: string;
  terms?: string;
  rows: EditorRow[];
};

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

let keySeq = 0;
const withKey = (r: EditorRow) => ({ ...r, key: `r${++keySeq}` });

export function DocumentForm({
  kind,
  action,
  sellerStateCode,
  termDays,
  companies,
  contacts,
  projects = [],
  leads = [],
  initial,
  submitLabel,
  stacked,
}: {
  kind: "invoice" | "quote";
  action: Action;
  sellerStateCode: string;
  /** Payment terms (invoice) or validity (quote) in days */
  termDays: number;
  companies: CompanyOpt[];
  contacts: ContactOpt[];
  projects?: ProjectOpt[];
  leads?: LeadOpt[];
  initial: DocumentInitial;
  submitLabel: string;
  /** Single column (for use inside a modal) */
  stacked?: boolean;
}) {
  const [workspace, setWorkspace] = useState<WorkspaceKey>(initial.workspace);
  const [companyId, setCompanyId] = useState(initial.companyId ?? "");
  const [contactId, setContactId] = useState(initial.contactId ?? "");
  const [projectId, setProjectId] = useState(initial.projectId ?? "");
  const [leadId, setLeadId] = useState(initial.leadId ?? "");
  const [billTo, setBillTo] = useState({
    name: initial.billTo?.name ?? "",
    gstin: initial.billTo?.gstin ?? "",
    address: initial.billTo?.address ?? "",
    stateCode: initial.billTo?.stateCode ?? "",
    email: initial.billTo?.email ?? "",
  });
  const [pos, setPos] = useState(initial.placeOfSupply ?? sellerStateCode ?? "");
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [endDate, setEndDate] = useState(initial.endDate ?? addDays(initial.issueDate, termDays));
  const [endTouched, setEndTouched] = useState(Boolean(initial.id));
  const [rows, setRows] = useState(() => (initial.rows.length ? initial.rows : [emptyRow()]).map(withKey));

  const totals = useMemo(() => editorTotalsFor(rows, sellerStateCode, pos), [rows, sellerStateCode, pos]);
  const visibleContacts = companyId ? contacts.filter((c) => c.companyId === companyId) : contacts;
  const visibleProjects = companyId ? projects.filter((p) => !p.companyId || p.companyId === companyId) : projects;

  function pickCompany(id: string) {
    setCompanyId(id);
    const c = companies.find((x) => x.id === id);
    if (contactId && !contacts.find((x) => x.id === contactId && x.companyId === id)) setContactId("");
    if (!c) return;
    setWorkspace(c.workspace);
    setBillTo({
      name: c.name,
      gstin: c.gstin ?? "",
      address: [c.address, c.city].filter((s) => s && s.trim()).join(", "),
      stateCode: c.stateCode ?? "",
      email: c.email ?? "",
    });
    if (c.stateCode) setPos(c.stateCode);
  }

  function pickLead(id: string) {
    setLeadId(id);
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    if (l.companyId) pickCompany(l.companyId);
    if (l.contactId) setContactId(l.contactId);
  }

  function pickContact(id: string) {
    setContactId(id);
    const p = contacts.find((x) => x.id === id);
    if (p && !companyId && kind === "invoice" && !billTo.name) setBillTo((b) => ({ ...b, name: p.name, email: p.email ?? b.email }));
  }

  function changeIssue(d: string) {
    setIssueDate(d);
    if (!endTouched && d) setEndDate(addDays(d, termDays));
  }

  const update = (key: string, patch: Partial<EditorRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, withKey(emptyRow(rs[rs.length - 1]?.gstRate ?? "18"))]);
  const removeRow = (key: string) => setRows((rs) => (rs.length === 1 ? [withKey(emptyRow())] : rs.filter((r) => r.key !== key)));

  const itemsJson = JSON.stringify(rows.map(({ key: _k, ...r }) => r));
  const posName = INDIAN_STATES.find((s) => s.code === pos)?.name;

  return (
    <ActionForm action={action} resetOnSuccess={false} className={cn("grid gap-6", !stacked && "lg:grid-cols-[minmax(0,1fr)_320px]")}>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="items" value={itemsJson} />
      <input type="hidden" name="workspace" value={workspace} />

      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.12em] text-fg-muted">{kind === "invoice" ? "Bill to" : "Quote for"}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {kind === "quote" && leads.length ? (
              <Field label="Lead" className="sm:col-span-2">
                <Select name="leadId" value={leadId} onChange={(e) => pickLead(e.target.value)}>
                  <option value="">— Not linked to a lead —</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : kind === "quote" ? (
              <input type="hidden" name="leadId" value={leadId} />
            ) : null}
            <Field label="Client company">
              <Select name="companyId" value={companyId} onChange={(e) => pickCompany(e.target.value)}>
                <option value="">— Choose a company —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contact person">
              <Select name="contactId" value={contactId} onChange={(e) => pickContact(e.target.value)}>
                <option value="">— Optional —</option>
                {visibleContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            {kind === "invoice" ? (
              <>
                <Field label="Billed name" className="sm:col-span-2">
                  <Input name="billToName" value={billTo.name} onChange={(e) => setBillTo({ ...billTo, name: e.target.value })} placeholder="Legal name as it should appear" required />
                </Field>
                <Field label="Client GSTIN" hint="Leave blank for unregistered clients">
                  <Input
                    name="billToGstin"
                    value={billTo.gstin}
                    maxLength={15}
                    className="uppercase"
                    onChange={(e) => {
                      const g = e.target.value.toUpperCase();
                      setBillTo({ ...billTo, gstin: g, stateCode: /^\d{2}/.test(g) ? g.slice(0, 2) : billTo.stateCode });
                      if (/^\d{2}/.test(g) && g.length >= 2) setPos(g.slice(0, 2));
                    }}
                    placeholder="27ABCDE1234F1Z5"
                  />
                </Field>
                <Field label="Billing email">
                  <Input name="billToEmail" type="email" value={billTo.email} onChange={(e) => setBillTo({ ...billTo, email: e.target.value })} placeholder="accounts@client.in" />
                </Field>
                <Field label="Billing address" className="sm:col-span-2">
                  <Textarea name="billToAddress" rows={2} value={billTo.address} onChange={(e) => setBillTo({ ...billTo, address: e.target.value })} />
                </Field>
                <input type="hidden" name="billToState" value={billTo.stateCode} />
              </>
            ) : null}

            <Field
              label="Place of supply"
              className="sm:col-span-2"
              hint={
                <span className={cn("inline-flex items-center gap-1.5 font-semibold", totals.interstate ? "text-sky-600 dark:text-sky-300" : "text-emerald-600 dark:text-emerald-300")}>
                  {totals.interstate ? <ArrowLeftRight className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                  {totals.interstate ? "Inter-state supply — IGST applies" : "Intra-state supply — CGST + SGST apply"}
                </span>
              }
            >
              <Select name="placeOfSupply" value={pos} onChange={(e) => setPos(e.target.value)}>
                <option value="">— Select state —</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            {!sellerStateCode ? (
              <p className="sm:col-span-2 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Your business state isn&apos;t set yet, so GST is treated as intra-state. Add it in Settings → Business.
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-fg-muted">Line items</h3>
            <span className="text-xs text-fg-subtle">{rows.filter((r) => rowToLine(r)).length} priced</span>
          </div>
          <div className="hidden grid-cols-[minmax(0,1fr)_88px_64px_112px_78px_104px_36px] gap-2 px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-fg-subtle md:grid">
            <span>Description</span>
            <span>HSN/SAC</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span>GST</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <div className="space-y-3 md:space-y-2">
            <AnimatePresence initial={false}>
              {rows.map((r, i) => {
                const line = rowToLine(r);
                const amount = line ? lineTaxable(line) : 0;
                return (
                  <motion.div
                    key={r.key}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
                    className="grid grid-cols-6 gap-2 rounded-2xl border border-line bg-solid/50 p-3 md:grid-cols-[minmax(0,1fr)_88px_64px_112px_78px_104px_36px] md:items-center md:rounded-xl md:border-0 md:bg-transparent md:p-0"
                  >
                    <Input
                      aria-label={`Line ${i + 1} description`}
                      className="col-span-6 md:col-span-1"
                      value={r.description}
                      onChange={(e) => update(r.key, { description: e.target.value })}
                      placeholder="What did you deliver?"
                    />
                    <Input aria-label="HSN/SAC" className="col-span-2 md:col-span-1" value={r.hsnSac} onChange={(e) => update(r.key, { hsnSac: e.target.value })} placeholder="SAC" />
                    <Input aria-label="Quantity" className="col-span-1 text-right tabular-nums md:col-span-1" inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} />
                    <div className="relative col-span-3 md:col-span-1">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-fg-subtle">₹</span>
                      <Input aria-label="Unit price" className="pl-6 text-right tabular-nums" inputMode="decimal" value={r.unitPrice} onChange={(e) => update(r.key, { unitPrice: e.target.value })} placeholder="0" />
                    </div>
                    <Select aria-label="GST rate" className="col-span-2 md:col-span-1" value={r.gstRate} onChange={(e) => update(r.key, { gstRate: e.target.value })}>
                      {(GST_RATE_OPTIONS.includes(r.gstRate) ? GST_RATE_OPTIONS : [...GST_RATE_OPTIONS, r.gstRate]).map((g) => (
                        <option key={g} value={g}>
                          {g}%
                        </option>
                      ))}
                    </Select>
                    <div className="col-span-3 flex items-center justify-end text-sm font-bold tabular-nums text-fg md:col-span-1">{formatINR(amount)}</div>
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      className="col-span-1 flex h-10 items-center justify-center rounded-xl text-fg-subtle transition hover:bg-rose-500/10 hover:text-rose-600"
                      aria-label={`Remove line ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          <button type="button" onClick={addRow} className={buttonClass("soft", "sm", "mt-4")}>
            <Plus className="h-4 w-4" /> Add line
          </button>
        </Card>

        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={kind === "invoice" ? "Notes to client" : "Notes"}>
              <Textarea name="notes" rows={3} defaultValue={initial.notes ?? ""} placeholder={kind === "invoice" ? "Thank you for your business!" : "Scope, assumptions, timelines"} />
            </Field>
            <Field label="Terms">
              <Textarea name="terms" rows={3} defaultValue={initial.terms ?? ""} />
            </Field>
          </div>
        </Card>
      </div>

      <div className={cn(!stacked && "lg:sticky lg:top-24 lg:self-start")}>
        <Card className="overflow-hidden">
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label={kind === "invoice" ? "Issue date" : "Quote date"}>
                <Input type="date" name="issueDate" value={issueDate} onChange={(e) => changeIssue(e.target.value)} required />
              </Field>
              <Field label={kind === "invoice" ? "Due date" : "Valid until"}>
                <Input
                  type="date"
                  name={kind === "invoice" ? "dueDate" : "validUntil"}
                  value={endDate}
                  min={issueDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setEndTouched(true);
                  }}
                />
              </Field>
            </div>
            {kind === "invoice" ? (
              <Field label="Project">
                <Select name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">— None —</option>
                  {visibleProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Workspace">
              <Select value={workspace} onChange={(e) => setWorkspace(e.target.value as WorkspaceKey)}>
                {WORKSPACE_OPTIONS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="border-t border-line bg-brand-soft/40 p-5">
            <dl className="space-y-2 text-sm">
              <Row label="Taxable value" value={totals.subtotalPaise} />
              {totals.interstate ? (
                <Row label="IGST" value={totals.igstPaise} />
              ) : (
                <>
                  <Row label="CGST" value={totals.cgstPaise} />
                  <Row label="SGST" value={totals.sgstPaise} />
                </>
              )}
              {totals.byRate.length > 1 ? (
                <div className="rounded-lg bg-solid/60 px-2.5 py-1.5 text-[11px] text-fg-subtle">
                  {totals.byRate.map((b) => (
                    <div key={b.gstRateBps} className="flex justify-between tabular-nums">
                      <span>
                        {b.gstRateBps / 100}% on {formatINR(b.taxablePaise)}
                      </span>
                      <span>{formatINR(b.taxPaise)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </dl>
            <div className="mt-4 flex items-end justify-between border-t border-line pt-4">
              <span className="text-sm font-semibold text-fg-muted">Total</span>
              <motion.span key={totals.totalPaise} initial={{ scale: 0.96, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className="text-2xl font-extrabold tabular-nums text-fg">
                {formatINR(totals.totalPaise)}
              </motion.span>
            </div>
            {posName ? <p className="mt-1 text-right text-[11px] text-fg-subtle">Place of supply: {posName}</p> : null}
            <SubmitButton className="mt-5 w-full" size="lg" pendingText="Saving…">
              {submitLabel}
            </SubmitButton>
          </div>
        </Card>
      </div>
    </ActionForm>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-fg">{formatINR(value)}</dd>
    </div>
  );
}
