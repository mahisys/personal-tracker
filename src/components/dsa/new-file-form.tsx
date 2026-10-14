"use client";
import { useMemo, useState } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { createLoanFileAction } from "@/server/dsa/actions";
import { BorrowerFields, ProductSelect, type PartnerOption } from "./fields";

export type BorrowerOption = { id: string; name: string; phone: string | null; city: string | null };

/** New loan file: pick an existing borrower or add one inline, then the loan basics. */
export function NewFileForm({
  borrowers,
  lenders,
  partners,
  borrowerId,
}: {
  borrowers: BorrowerOption[];
  lenders: { id: string; name: string }[];
  partners: PartnerOption[];
  borrowerId?: string;
}) {
  const [mode, setMode] = useState<"existing" | "new">(borrowerId || borrowers.length ? "existing" : "new");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string>(borrowerId ?? "");
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? borrowers.filter((b) => [b.name, b.phone, b.city].some((v) => v?.toLowerCase().includes(t))) : borrowers;
    return list.slice(0, 8);
  }, [q, borrowers]);
  const pickedRow = borrowers.find((b) => b.id === picked);

  return (
    <ActionForm action={createLoanFileAction}>
      <input type="hidden" name="borrowerMode" value={mode} />
      {borrowerId ? (
        <input type="hidden" name="borrowerId" value={borrowerId} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
            {(
              [
                ["existing", "Existing borrower", Users],
                ["new", "New borrower", UserPlus],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={cn("flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition", mode === k ? "bg-solid text-fg shadow-sm" : "text-fg-muted hover:text-fg")}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
            <div className="mb-5">
              <input type="hidden" name="borrowerId" value={picked} />
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or city" className="pl-10" autoFocus />
              </div>
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {matches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setPicked(b.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition",
                      picked === b.id ? "border-amber-400 bg-amber-400/10" : "border-transparent hover:bg-muted",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-fg">{b.name}</span>
                      <span className="block truncate text-xs text-fg-subtle">{[b.phone, b.city].filter(Boolean).join(" · ") || "No contact details"}</span>
                    </span>
                    {picked === b.id ? <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Selected</span> : null}
                  </button>
                ))}
                {matches.length === 0 ? (
                  <p className="px-1 py-3 text-sm text-fg-muted">
                    No match.{" "}
                    <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setMode("new")}>
                      Add them as a new borrower
                    </button>
                  </p>
                ) : null}
              </div>
              {pickedRow ? <p className="mt-2 text-xs text-fg-muted">Opening a file for <b className="text-fg">{pickedRow.name}</b></p> : null}
            </div>
          ) : (
            <div className="mb-5">
              <BorrowerFields partners={partners} prefix="b_" />
            </div>
          )}
          <div className="mb-4 border-t border-line" />
        </>
      )}

      <FormGrid>
        <Field label="Product">
          <ProductSelect />
        </Field>
        <Field label="Amount required">
          <MoneyInput name="amountRequested" required placeholder="e.g. 25,00,000" />
        </Field>
        <Field label="Lender (optional)" hint="You can pick it at login">
          <Select name="lenderId" defaultValue="">
            <option value="">Not decided yet</option>
            {lenders.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        {mode === "existing" ? (
          <Field label="Sub-connector">
            <Select name="subConnectorId" defaultValue="">
              <option value="">Same as borrower</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Notes" className="sm:col-span-2">
          <Textarea name="notes" rows={2} placeholder="Requirement, property, urgency…" />
        </Field>
      </FormGrid>
      <ModalActions>
        <SubmitButton pendingText="Opening…">Open file</SubmitButton>
      </ModalActions>
    </ActionForm>
  );
}
