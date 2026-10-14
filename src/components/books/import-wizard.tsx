"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, PartyPopper, Upload } from "lucide-react";
import type { WorkspaceKey } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { Field, FormGrid, Select } from "@/components/ui/form";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { celebrate } from "@/components/client/celebrate";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";
import { formatINR } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { commitImport, previewStatement, readStatement } from "@/server/books/import-actions";
import type { ColumnMapping, DateFormat } from "@/server/books/import";
import type { ImportPreviewLine } from "@/server/books/import-service";
import type { AccountOption, CategoryOption } from "./transaction-dialog";

const DATE_FORMATS: DateFormat[] = ["DD/MM/YYYY", "DD-MM-YYYY", "YYYY-MM-DD", "DD MMM YYYY"];

type Step = "upload" | "map" | "preview" | "done";
type Edit = { selected: boolean; categoryId: string | null; workspace: WorkspaceKey };

export function ImportWizard({ accounts, categories, defaultWorkspace }: { accounts: AccountOption[]; categories: CategoryOption[]; defaultWorkspace: WorkspaceKey }) {
  const [step, setStep] = useState<Step>("upload");
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [workspace, setWorkspace] = useState<WorkspaceKey>(defaultWorkspace);
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [lines, setLines] = useState<ImportPreviewLine[]>([]);
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [result, setResult] = useState<{ imported: number; existed: number; message: string } | null>(null);

  const account = accounts.find((a) => a.id === accountId);

  function onUpload(form: FormData) {
    start(async () => {
      const res = await readStatement(form);
      if (!res.ok) return void toast.error(res.error);
      setFile({ name: res.fileName, headers: res.headers, rows: res.rows });
      setMapping(res.mapping);
      setStep("map");
    });
  }

  function onPreview() {
    if (!file || !mapping) return;
    start(async () => {
      const res = await previewStatement({ accountId, rows: file.rows, mapping, workspace });
      if (!res.ok) return void toast.error(res.error);
      setLines(res.lines);
      setEdits(Object.fromEntries(res.lines.map((l) => [l.row, { selected: !l.error && !l.duplicate, categoryId: l.categoryId, workspace: l.workspace }])));
      setStep("preview");
    });
  }

  const selected = lines.filter((l) => edits[l.row]?.selected);
  const selIn = selected.filter((l) => l.type === "income").reduce((s, l) => s + l.amountPaise, 0);
  const selOut = selected.filter((l) => l.type === "expense").reduce((s, l) => s + l.amountPaise, 0);

  function onImport() {
    start(async () => {
      const res = await commitImport({
        accountId,
        lines: selected.map((l) => ({
          hash: l.hash,
          date: l.date!,
          description: l.description,
          reference: l.reference,
          amountPaise: l.amountPaise,
          type: l.type,
          categoryId: edits[l.row].categoryId,
          workspace: edits[l.row].workspace,
        })),
      });
      if (!res.ok) return void toast.error(res.error);
      setResult(res);
      setStep("done");
      toast.success(res.message);
      if (res.imported > 0) celebrate();
    });
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setMapping(null);
    setLines([]);
    setEdits({});
    setResult(null);
  }

  if (accounts.length === 0) {
    return (
      <Card className="p-6 text-sm text-fg-muted">
        First add the bank account this statement belongs to — <Link href="/books/accounts?new=1" className="font-semibold text-brand">add an account</Link>.
      </Card>
    );
  }

  return (
    <div>
      <Steps step={step} />
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
          {step === "upload" ? (
            <Card className="p-5 sm:p-6">
              <form action={onUpload} className="space-y-5">
                <FormGrid>
                  <Field label="Bank account">
                    <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ••${a.last4}` : ""}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Default workspace" hint="Used when the account or category doesn't say">
                    <Select value={workspace} onChange={(e) => setWorkspace(e.target.value as WorkspaceKey)}>
                      {WORKSPACE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </Field>
                </FormGrid>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-muted/40 px-6 py-10 text-center transition hover:border-brand hover:bg-brand-soft">
                  <FileSpreadsheet className="h-8 w-8 text-brand" />
                  <span className="font-bold text-fg">Choose a CSV statement</span>
                  <span className="text-xs text-fg-muted">From net banking: Statement → Download → CSV (or Excel, saved as CSV). Max 5 MB.</span>
                  <input type="file" name="file" accept=".csv,text/csv,.txt" required className="mt-2 block w-full max-w-xs text-sm text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand" />
                </label>
                <div className="flex justify-end">
                  <Button type="submit" disabled={pending}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Read statement
                  </Button>
                </div>
              </form>
            </Card>
          ) : null}

          {step === "map" && file && mapping ? (
            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                <FileSpreadsheet className="h-4 w-4 text-brand" /> <span className="font-semibold text-fg">{file.name}</span> · {file.rows.length} lines · into <span className="font-semibold text-fg">{account?.name}</span>
              </div>
              <p className="mb-4 text-sm text-fg-muted">We guessed the columns — check them against the sample below.</p>
              <FormGrid cols={3}>
                <ColumnSelect label="Date" headers={file.headers} value={mapping.date} onChange={(v) => setMapping({ ...mapping, date: v ?? 0 })} />
                <Field label="Date format">
                  <Select value={mapping.dateFormat} onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value as DateFormat })}>
                    {DATE_FORMATS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </Select>
                </Field>
                <ColumnSelect label="Description" headers={file.headers} value={mapping.description} onChange={(v) => setMapping({ ...mapping, description: v ?? 0 })} />
                <Field label="Amounts are in">
                  <Select value={mapping.amountMode} onChange={(e) => setMapping({ ...mapping, amountMode: e.target.value as ColumnMapping["amountMode"] })}>
                    <option value="split">Separate debit & credit columns</option>
                    <option value="signed">One column (minus = money out)</option>
                  </Select>
                </Field>
                {mapping.amountMode === "split" ? (
                  <>
                    <ColumnSelect label="Debit (money out)" headers={file.headers} value={mapping.debit ?? null} optional onChange={(v) => setMapping({ ...mapping, debit: v })} />
                    <ColumnSelect label="Credit (money in)" headers={file.headers} value={mapping.credit ?? null} optional onChange={(v) => setMapping({ ...mapping, credit: v })} />
                  </>
                ) : (
                  <>
                    <ColumnSelect label="Amount" headers={file.headers} value={mapping.amount ?? null} optional onChange={(v) => setMapping({ ...mapping, amount: v })} />
                    <Field label="Sign">
                      <Select value={mapping.invertSign ? "1" : "0"} onChange={(e) => setMapping({ ...mapping, invertSign: e.target.value === "1" })}>
                        <option value="0">Negative = money out</option>
                        <option value="1">Positive = money out (cards)</option>
                      </Select>
                    </Field>
                  </>
                )}
                <ColumnSelect label="Reference (optional)" headers={file.headers} value={mapping.reference ?? null} optional onChange={(v) => setMapping({ ...mapping, reference: v })} />
              </FormGrid>

              <div className="mt-6 overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="bg-muted text-left text-fg-muted">
                    <tr>
                      {file.headers.map((h, i) => (
                        <th key={i} className={cn("px-3 py-2 font-bold", [mapping.date, mapping.description, mapping.debit, mapping.credit, mapping.amount].includes(i) && "text-brand")}>{h || `Column ${i + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {file.rows.slice(0, 5).map((r, ri) => (
                      <tr key={ri} className="border-t border-line">
                        {r.map((c, ci) => (
                          <td key={ci} className="max-w-[220px] truncate px-3 py-2 text-fg">{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button variant="ghost" onClick={reset}><ArrowLeft className="h-4 w-4" /> Different file</Button>
                <Button onClick={onPreview} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Preview lines</Button>
              </div>
            </Card>
          ) : null}

          {step === "preview" ? (
            <PreviewStep
              lines={lines}
              edits={edits}
              setEdits={setEdits}
              categories={categories}
              pending={pending}
              onBack={() => setStep("map")}
              onImport={onImport}
              selectedCount={selected.length}
              selIn={selIn}
              selOut={selOut}
            />
          ) : null}

          {step === "done" && result ? (
            <Card className="flex flex-col items-center px-6 py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 animate-pop-in dark:text-emerald-300">
                {result.imported > 0 ? <PartyPopper className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8" />}
              </div>
              <h2 className="text-xl font-extrabold text-fg">{result.imported > 0 ? "Statement imported" : "Already up to date"}</h2>
              <p className="mt-1 text-fg-muted">{result.message}.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Link href={`/books/accounts/${accountId}`} className={buttonClass("primary")}>See the account</Link>
                <Link href="/books/transactions?categoryId=none&from=&to=" className={buttonClass("secondary")}>Tidy uncategorised</Link>
                <Button variant="ghost" onClick={reset}>Import another</Button>
              </div>
            </Card>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Columns" },
    { key: "preview", label: "Review" },
    { key: "done", label: "Done" },
  ];
  const idx = items.findIndex((i) => i.key === step);
  return (
    <ol className="mb-5 flex items-center gap-2">
      {items.map((it, i) => (
        <li key={it.key} className="flex flex-1 items-center gap-2">
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all", i < idx ? "bg-emerald-500 text-white" : i === idx ? "bg-brand text-white shadow-md" : "bg-muted text-fg-subtle")}>
            {i < idx ? "✓" : i + 1}
          </span>
          <span className={cn("hidden text-sm font-semibold sm:inline", i === idx ? "text-fg" : "text-fg-subtle")}>{it.label}</span>
          {i < items.length - 1 ? <span className={cn("h-px flex-1", i < idx ? "bg-emerald-500/50" : "bg-line-strong")} /> : null}
        </li>
      ))}
    </ol>
  );
}

function ColumnSelect({ label, headers, value, onChange, optional }: { label: string; headers: string[]; value: number | null; onChange: (v: number | null) => void; optional?: boolean }) {
  return (
    <Field label={label}>
      <Select value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
        {optional ? <option value="">— None —</option> : null}
        {headers.map((h, i) => (
          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
        ))}
      </Select>
    </Field>
  );
}

function PreviewStep({
  lines,
  edits,
  setEdits,
  categories,
  pending,
  onBack,
  onImport,
  selectedCount,
  selIn,
  selOut,
}: {
  lines: ImportPreviewLine[];
  edits: Record<number, Edit>;
  setEdits: (fn: (e: Record<number, Edit>) => Record<number, Edit>) => void;
  categories: CategoryOption[];
  pending: boolean;
  onBack: () => void;
  onImport: () => void;
  selectedCount: number;
  selIn: number;
  selOut: number;
}) {
  const importable = lines.filter((l) => !l.error);
  const dupes = lines.filter((l) => l.duplicate).length;
  const errors = lines.filter((l) => l.error).length;
  const matched = importable.filter((l) => l.categoryId).length;
  const byKind = useMemo(() => ({ income: categories.filter((c) => c.kind === "income"), expense: categories.filter((c) => c.kind === "expense") }), [categories]);
  const allOn = importable.filter((l) => !l.duplicate).every((l) => edits[l.row]?.selected);
  const update = (row: number, patch: Partial<Edit>) => setEdits((e) => ({ ...e, [row]: { ...e[row], ...patch } }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge tone="brand">{importable.length} lines</Badge>
        <Badge tone="good">{matched} auto-categorised</Badge>
        {dupes ? <Badge tone="info">{dupes} already imported</Badge> : null}
        {errors ? <Badge tone="warn">{errors} skipped (no date/amount)</Badge> : null}
      </div>
      <div className="glass overflow-hidden rounded-[var(--radius-card)] border border-line shadow-card">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-fg-subtle">
          <input
            type="checkbox"
            aria-label="Select all"
            className="h-4 w-4 accent-[var(--brand)]"
            checked={allOn}
            onChange={() => setEdits((e) => Object.fromEntries(Object.entries(e).map(([k, v]) => {
              const l = lines.find((x) => x.row === Number(k))!;
              return [k, { ...v, selected: !l.error && !l.duplicate && !allOn }];
            })))}
          />
          Select all new lines
        </div>
        <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
          {lines.map((l) => {
            const e = edits[l.row];
            const disabled = !!l.error;
            return (
              <li key={l.row} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center", (disabled || l.duplicate) && "opacity-55", e?.selected && "bg-brand-soft/40")}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]" disabled={disabled} checked={!!e?.selected} onChange={() => update(l.row, { selected: !e.selected })} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">{l.description || "(no description)"}</span>
                    <span className="text-xs text-fg-muted">
                      {l.date ? formatDay(l.date) : "—"}
                      {l.error ? <span className="ml-2 text-amber-700 dark:text-amber-300">{l.error}</span> : null}
                      {l.duplicate ? <span className="ml-2 text-sky-700 dark:text-sky-300">Already in your books</span> : null}
                    </span>
                  </span>
                  <span className={cn("shrink-0 font-bold tabular-nums", l.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                    {l.error ? "" : `${l.type === "income" ? "+" : "−"}${formatINR(l.amountPaise)}`}
                  </span>
                </label>
                {!disabled ? (
                  <div className="flex gap-2 pl-7 sm:pl-0">
                    <Select className="h-9 min-w-0 flex-1 text-xs sm:w-44" value={e?.categoryId ?? ""} onChange={(ev) => update(l.row, { categoryId: ev.target.value || null })} aria-label="Category">
                      <option value="">Uncategorised</option>
                      {byKind[l.type].map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                    <Select className="h-9 w-28 text-xs" value={e?.workspace} onChange={(ev) => update(l.row, { workspace: ev.target.value as WorkspaceKey })} aria-label="Workspace">
                      {WORKSPACE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="sticky bottom-24 z-10 flex flex-col gap-3 rounded-2xl border border-line bg-solid/95 p-3 shadow-pop backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
        <div className="text-sm text-fg-muted">
          <span className="font-bold text-fg">{selectedCount}</span> selected ·{" "}
          <span className="text-emerald-600 dark:text-emerald-400">+{formatINR(selIn, { whole: true })}</span> ·{" "}
          <span className="text-rose-600 dark:text-rose-400">−{formatINR(selOut, { whole: true })}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Columns</Button>
          <Button onClick={onImport} disabled={pending || selectedCount === 0}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Import {selectedCount}
          </Button>
        </div>
      </div>
    </div>
  );
}
