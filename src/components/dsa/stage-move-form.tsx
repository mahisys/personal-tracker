"use client";
import type { LoanStage } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { ModalActions } from "@/components/client/modal";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { paiseToInput, formatINR } from "@/lib/money";
import { moveStageAction } from "@/server/dsa/actions";
import { CLOSE_REASONS, STAGE_LABELS } from "@/server/dsa/constants";

/** What the move form needs to know about a file to prefill its fields. */
export type MoveTarget = {
  id: string;
  borrowerName: string;
  lenderId: string | null;
  applicationNo: string | null;
  loginDate: string | null;
  amountRequestedPaise: number;
  sanctionedPaise: number | null;
  sanctionDate: string | null;
  disbursedPaise: number | null;
  disbursalDate: string | null;
  /** Expected net from the payout (gross + GST − TDS), when there is one */
  payoutNetPaise?: number | null;
  payoutTdsPaise?: number | null;
  payoutGrossPaise?: number | null;
};

export type Option = { id: string; name: string };

const CTA: Partial<Record<LoanStage, string>> = {
  sanctioned: "Mark sanctioned",
  disbursed: "Mark disbursed",
  logged_in: "Mark logged in",
  payout_invoiced: "Mark invoiced",
  payout_received: "Record payout",
  rejected: "Mark rejected",
  dropped: "Drop file",
};

export function stageMoveCopy(stage: LoanStage): { title: string; description: string } {
  switch (stage) {
    case "logged_in":
      return { title: "Logged in with the lender", description: "Note the application number so you can chase it." };
    case "sanctioned":
      return { title: "Sanctioned 🎉", description: "Record what the lender approved." };
    case "disbursed":
      return { title: "Disbursed", description: "We'll work out your payout from the lender's grid." };
    case "payout_invoiced":
      return { title: "Invoice the payout", description: "Raise your commission invoice to the lender." };
    case "payout_received":
      return { title: "Payout received", description: "This goes straight into your books as DSA income." };
    case "rejected":
      return { title: "Rejected by the lender", description: "A short reason helps spot patterns later." };
    case "dropped":
      return { title: "Drop this file", description: "The customer moved on? Note why." };
    default:
      return { title: `Move to ${STAGE_LABELS[stage]}`, description: "Add a note if it helps." };
  }
}

export function StageMoveForm({
  file,
  stage,
  lenders,
  accounts,
  today,
  onDone,
}: {
  file: MoveTarget;
  stage: LoanStage;
  lenders: Option[];
  accounts: Option[];
  today: string;
  onDone?: () => void;
}) {
  return (
    <ActionForm action={moveStageAction} onSuccess={onDone}>
      <input type="hidden" name="fileId" value={file.id} />
      <input type="hidden" name="stage" value={stage} />
      <FormGrid>
        {stage === "logged_in" ? (
          <>
            <Field label="Lender">
              <Select name="lenderId" defaultValue={file.lenderId ?? ""} required>
                <option value="" disabled>
                  Pick a lender
                </option>
                {lenders.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Application / LAN no.">
              <Input name="applicationNo" defaultValue={file.applicationNo ?? ""} required placeholder="e.g. HL0012345" />
            </Field>
            <Field label="Login date">
              <Input type="date" name="loginDate" defaultValue={file.loginDate ?? today} required />
            </Field>
          </>
        ) : null}

        {stage === "sanctioned" ? (
          <>
            <Field label="Sanctioned amount" hint={`Asked for ${formatINR(file.amountRequestedPaise, { whole: true })}`}>
              <MoneyInput name="sanctioned" defaultValue={paiseToInput(file.sanctionedPaise ?? file.amountRequestedPaise)} required />
            </Field>
            <Field label="Sanction date">
              <Input type="date" name="sanctionDate" defaultValue={file.sanctionDate ?? today} required />
            </Field>
          </>
        ) : null}

        {stage === "disbursed" ? (
          <>
            {!file.lenderId ? (
              <Field label="Lender" className="sm:col-span-2">
                <Select name="lenderId" defaultValue="" required>
                  <option value="" disabled>
                    Pick a lender
                  </option>
                  {lenders.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Disbursed amount" hint={file.sanctionedPaise ? `Sanctioned ${formatINR(file.sanctionedPaise, { whole: true })}` : undefined}>
              <MoneyInput name="disbursed" defaultValue={paiseToInput(file.disbursedPaise ?? file.sanctionedPaise ?? file.amountRequestedPaise)} required />
            </Field>
            <Field label="Disbursal date">
              <Input type="date" name="disbursalDate" defaultValue={file.disbursalDate ?? today} required />
            </Field>
          </>
        ) : null}

        {stage === "payout_invoiced" ? (
          <>
            <Field label="Invoice no.">
              <Input name="invoiceNo" required placeholder="e.g. DSA/26-27/014" />
            </Field>
            <Field label="Invoice date">
              <Input type="date" name="invoiceDate" defaultValue={today} required />
            </Field>
          </>
        ) : null}

        {stage === "payout_received" ? (
          <>
            <Field label="Received on">
              <Input type="date" name="receivedDate" defaultValue={today} required />
            </Field>
            <Field label="Into account">
              <Select name="accountId" defaultValue={accounts[0]?.id ?? ""} required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Net amount received" hint="Gross + GST − TDS, as credited">
              <MoneyInput name="netReceived" defaultValue={paiseToInput(file.payoutNetPaise ?? null)} required />
            </Field>
            <Field label="TDS deducted" hint="Shows up in your Form 26AS">
              <MoneyInput name="tds" defaultValue={paiseToInput(file.payoutTdsPaise ?? null)} />
            </Field>
          </>
        ) : null}

        {stage === "rejected" || stage === "dropped" ? (
          <Field label="Reason" className="sm:col-span-2">
            <Input name="closeReason" list="dsa-close-reasons" required placeholder="e.g. Low CIBIL" autoFocus />
            <datalist id="dsa-close-reasons">
              {CLOSE_REASONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
        ) : (
          <Field label="Note (optional)" className="sm:col-span-2">
            <Textarea name="note" rows={2} placeholder="Anything worth remembering about this step" />
          </Field>
        )}
      </FormGrid>
      <ModalActions>
        <SubmitButton variant={stage === "rejected" || stage === "dropped" ? "danger" : stage === "payout_received" || stage === "disbursed" || stage === "sanctioned" ? "success" : "primary"} pendingText="Saving…">
          {CTA[stage] ?? `Move to ${STAGE_LABELS[stage]}`}
        </SubmitButton>
      </ModalActions>
    </ActionForm>
  );
}
