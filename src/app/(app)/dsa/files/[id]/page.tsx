import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  AlarmClock,
  ArrowLeft,
  BadgeIndianRupee,
  CheckCircle2,
  Circle,
  ClipboardList,
  Hourglass,
  Landmark,
  ListChecks,
  Pencil,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import type { LoanStage } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { Attachments } from "@/components/shared/attachments";
import { History } from "@/components/shared/history";
import { StageControl } from "@/components/dsa/stage-control";
import { DocChecklist } from "@/components/dsa/doc-checklist";
import { ActivityLog } from "@/components/dsa/activity-log";
import { ContactLinks } from "@/components/dsa/contact";
import { DaysChip, PendingChip, ProductTag, StageBadge } from "@/components/dsa/chips";
import { ProductSelect } from "@/components/dsa/fields";
import { EditPayoutButton, InvoiceButton, PartnerPaidButton, ReceiveButton } from "@/components/dsa/payout-forms";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDay, relativeDay, todayIST, toDateTimeLocalIST, toISTDate } from "@/lib/dates";
import { bpsToPercent, formatINR, formatINRShort, paiseToInput } from "@/lib/money";
import {
  addFileTaskAction,
  deleteLoanFileAction,
  setFollowUpAction,
  setPayoutRateAction,
  toggleFileTaskAction,
  updateLoanFileAction,
  updatePendingAction,
} from "@/server/dsa/actions";
import { EMPLOYMENT_LABELS, PENDING_LABELS, PENDING_ORDER, PRODUCT_LABELS, STAGE_LABELS, type EmploymentType } from "@/server/dsa/constants";
import { daysWaiting, furthestStageIndex, netOf, stageStaleness } from "@/server/dsa/logic";
import { accountOptions, getFileDetail, lenderOptions, partnerOptions } from "@/server/dsa/queries";

export const metadata: Metadata = { title: "Loan file" };

export default async function LoanFilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getFileDetail(id);
  if (!d) notFound();
  const [lenders, accounts, partners] = await Promise.all([lenderOptions(true), accountOptions(), partnerOptions()]);
  const { file: f, borrower: b, lender, partner, payout } = d;
  const today = todayIST();
  const st = stageStaleness(f.stage, f.stageChangedAt, today);
  const waiting = daysWaiting({ id: f.id, pendingWith: f.pendingWith, stageChangedAt: f.stageChangedAt, pendingSince: d.pendingSince }, today);
  const path = `/dsa/files/${f.id}`;
  const headline = f.disbursedPaise ?? f.sanctionedPaise ?? f.amountRequestedPaise;
  const followDue = f.nextFollowUpAt && toISTDate(f.nextFollowUpAt) <= today;
  const reached = furthestStageIndex(f.stage, d.history.map((h) => h.toStage as LoanStage));
  const openTasks = d.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

  return (
    <>
      <Link href="/dsa" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted transition hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> DSA desk
      </Link>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            {PRODUCT_LABELS[f.product]}
            {f.applicationNo ? <span className="font-mono normal-case tracking-normal text-fg-subtle">#{f.applicationNo}</span> : null}
          </span>
        }
        title={b.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold tabular-nums text-fg">{formatINR(headline, { whole: true })}</span>
            <span>·</span>
            <span>{lender?.name ?? "Lender not picked yet"}</span>
            <StageBadge stage={f.stage} />
            {st.limit ? <DaysChip days={st.days} level={st.level} limit={st.limit} /> : null}
          </span>
        }
        actions={
          <>
            <Modal
              trigger={
                <>
                  <Pencil className="h-4 w-4" /> Edit
                </>
              }
              variant="secondary"
              title="Edit file"
              wide
            >
              <ActionForm action={updateLoanFileAction} resetOnSuccess={false}>
                <input type="hidden" name="id" value={f.id} />
                <FormGrid cols={3}>
                  <Field label="Product">
                    <ProductSelect defaultValue={f.product} />
                  </Field>
                  <Field label="Amount required">
                    <MoneyInput name="amountRequested" defaultValue={paiseToInput(f.amountRequestedPaise)} required />
                  </Field>
                  <Field label="Lender">
                    <Select name="lenderId" defaultValue={f.lenderId ?? ""}>
                      <option value="">Not decided</option>
                      {lenders.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Application no.">
                    <Input name="applicationNo" defaultValue={f.applicationNo ?? ""} />
                  </Field>
                  <Field label="Login date">
                    <Input type="date" name="loginDate" defaultValue={f.loginDate ?? ""} />
                  </Field>
                  <Field label="Sub-connector">
                    <Select name="subConnectorId" defaultValue={f.subConnectorId ?? ""}>
                      <option value="">None</option>
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Sanctioned">
                    <MoneyInput name="sanctioned" defaultValue={paiseToInput(f.sanctionedPaise)} />
                  </Field>
                  <Field label="Sanction date">
                    <Input type="date" name="sanctionDate" defaultValue={f.sanctionDate ?? ""} />
                  </Field>
                  <div className="hidden sm:block" />
                  <Field label="Disbursed">
                    <MoneyInput name="disbursed" defaultValue={paiseToInput(f.disbursedPaise)} />
                  </Field>
                  <Field label="Disbursal date">
                    <Input type="date" name="disbursalDate" defaultValue={f.disbursalDate ?? ""} />
                  </Field>
                  <div className="hidden sm:block" />
                  <Field label="Notes" className="sm:col-span-3">
                    <Textarea name="notes" defaultValue={f.notes} rows={3} />
                  </Field>
                </FormGrid>
                <p className="mt-3 text-xs text-fg-subtle">To change the stage, use the stepper — it keeps history and payouts in step.</p>
                <ModalActions>
                  <SubmitButton>Save</SubmitButton>
                </ModalActions>
              </ActionForm>
            </Modal>
            <ActionButton action={deleteLoanFileAction} hidden={{ id: f.id }} variant="ghost" size="icon" confirm="Delete this file, its checklist and history? This can't be undone." title="Delete file">
              <Trash2 className="h-4 w-4" />
            </ActionButton>
          </>
        }
      />

      <Card className="mb-6 animate-fade-up">
        <CardBody>
          <StageControl
            file={{
              id: f.id,
              borrowerName: b.name,
              lenderId: f.lenderId,
              applicationNo: f.applicationNo,
              loginDate: f.loginDate,
              amountRequestedPaise: f.amountRequestedPaise,
              sanctionedPaise: f.sanctionedPaise,
              sanctionDate: f.sanctionDate,
              disbursedPaise: f.disbursedPaise,
              disbursalDate: f.disbursalDate,
              payoutNetPaise: payout ? netOf(payout) : null,
              payoutTdsPaise: payout?.tdsPaise ?? null,
              payoutGrossPaise: payout?.grossPaise ?? null,
            }}
            stage={f.stage}
            lenders={lenders.filter((l) => l.active || l.id === f.lenderId)}
            accounts={accounts}
            today={today}
            closeReason={f.closeReason}
            reachedIndex={reached}
          />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="stagger space-y-6 lg:col-span-2">
          {/* Pending with */}
          <Card className={cn(f.pendingWith !== "none" && waiting >= 3 && "border-amber-400/50")}>
            <CardHeader
              title="Pending with"
              icon={<Hourglass className="h-4.5 w-4.5" />}
              description={f.pendingWith === "none" ? "Nothing pending right now" : `Waiting ${waiting === 0 ? "since today" : `${waiting} day${waiting === 1 ? "" : "s"}`}`}
              actions={<PendingChip pendingWith={f.pendingWith} />}
            />
            <CardBody className="space-y-4">
              <ActionForm action={updatePendingAction} resetOnSuccess={false} className="space-y-3">
                <input type="hidden" name="fileId" value={f.id} />
                <div className="flex flex-wrap gap-1.5">
                  {PENDING_ORDER.map((p) => (
                    <label
                      key={p}
                      className="cursor-pointer rounded-full border border-line-strong px-3 py-1.5 text-sm font-semibold text-fg-muted transition hover:border-amber-400 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-500/12 has-[:checked]:text-amber-800 dark:has-[:checked]:text-amber-300"
                    >
                      <input type="radio" name="pendingWith" value={p} defaultChecked={f.pendingWith === p} className="sr-only" />
                      {PENDING_LABELS[p]}
                    </label>
                  ))}
                </div>
                <Textarea name="pendingNote" rows={2} defaultValue={f.pendingNote} placeholder="What exactly is pending? e.g. 6-month bank statement, OTC on PD" />
                <div className="flex justify-end">
                  <SubmitButton size="sm" variant="soft">
                    Update
                  </SubmitButton>
                </div>
              </ActionForm>
              <div className="rounded-2xl bg-muted/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <AlarmClock className={cn("h-4 w-4", followDue ? "text-rose-500" : "text-fg-muted")} />
                    {f.nextFollowUpAt ? (
                      <span className={cn(followDue && "text-rose-600 dark:text-rose-300")}>
                        Follow up {formatDateTime(f.nextFollowUpAt)}
                        {followDue ? " — due" : ""}
                      </span>
                    ) : (
                      "No follow-up set"
                    )}
                  </div>
                  {f.nextFollowUpAt ? (
                    <ActionButton action={setFollowUpAction} hidden={{ fileId: f.id, clear: "1" }} variant="ghost" size="sm">
                      Clear
                    </ActionButton>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    [1, "+1 day"],
                    [3, "+3 days"],
                    [7, "+1 week"],
                  ].map(([n, label]) => (
                    <ActionButton key={n} action={setFollowUpAction} hidden={{ fileId: f.id, inDays: n }} variant="secondary" size="sm">
                      {label}
                    </ActionButton>
                  ))}
                  <ActionForm action={setFollowUpAction} className="flex items-center gap-2">
                    <input type="hidden" name="fileId" value={f.id} />
                    <Input type="datetime-local" name="at" defaultValue={toDateTimeLocalIST(f.nextFollowUpAt)} className="h-8 w-auto text-xs" required />
                    <SubmitButton size="sm" variant="ghost">
                      Set
                    </SubmitButton>
                  </ActionForm>
                </div>
              </div>
            </CardBody>
          </Card>

          <DocChecklist fileId={f.id} docs={d.docs} />

          <ActivityLog items={d.activities} loanFileId={f.id} borrowerId={b.id} />

          {/* Linked tasks */}
          <Card>
            <CardHeader
              title="Tasks"
              icon={<ListChecks className="h-4.5 w-4.5" />}
              description={openTasks.length ? `${openTasks.length} open` : d.tasks.length ? "All done ✓" : "Anything you need to do for this file"}
            />
            <CardBody className="space-y-3">
              {d.tasks.length ? (
                <ul className="stagger space-y-1">
                  {d.tasks.map((t) => {
                    const doneT = t.status === "done";
                    const overdue = !doneT && t.dueDate && t.dueDate < today;
                    return (
                      <li key={t.id} className="flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-muted/60">
                        <ActionButton action={toggleFileTaskAction} hidden={{ id: t.id }} variant="ghost" size="icon" className="h-8 w-8" title={doneT ? "Reopen" : "Mark done"}>
                          {doneT ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5" />}
                        </ActionButton>
                        <span className={cn("min-w-0 flex-1 truncate text-sm", doneT ? "text-fg-subtle line-through" : "text-fg")}>{t.title}</span>
                        {t.dueDate ? <span className={cn("shrink-0 text-xs", overdue ? "font-semibold text-rose-600 dark:text-rose-300" : "text-fg-subtle")}>{relativeDay(t.dueDate, today)}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <ActionForm action={addFileTaskAction} className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="fileId" value={f.id} />
                <Input name="title" placeholder="e.g. Collect PDCs, book valuation" required />
                <Input type="date" name="dueDate" defaultValue={today} className="sm:w-40" />
                <SubmitButton variant="soft" className="shrink-0">
                  Add task
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <History entityType="loan_file" entityId={f.id} />
        </div>

        <div className="stagger space-y-6">
          {/* Payout */}
          <Card className={cn(payout?.status === "received" && "border-emerald-400/50")}>
            <CardHeader
              title="Payout"
              icon={<BadgeIndianRupee className="h-4.5 w-4.5" />}
              description={
                payout
                  ? payout.status === "received"
                    ? `Received ${formatDay(payout.receivedDate)}`
                    : payout.status === "invoiced"
                      ? `Invoiced ${formatDay(payout.invoiceDate)}${payout.invoiceNo ? ` · ${payout.invoiceNo}` : ""}`
                      : `Expected ${payout.expectedDate ? relativeDay(payout.expectedDate, today).toLowerCase() : "soon"}`
                  : "Appears once the file is disbursed"
              }
              actions={payout ? <Badge tone={payout.status === "received" ? "good" : payout.status === "invoiced" ? "info" : "warn"}>{payout.status}</Badge> : null}
            />
            <CardBody className="space-y-4">
              {payout ? (
                <>
                  {payout.grossPaise === 0 ? (
                    <div className="rounded-2xl bg-amber-500/10 p-3 ring-1 ring-inset ring-amber-500/25">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Set the payout rate</p>
                      <p className="mb-3 text-xs text-amber-800/80 dark:text-amber-300/80">
                        {lender?.name ?? "This lender"} has no grid row for {PRODUCT_LABELS[f.product].toLowerCase()} at this ticket size. Add the rate and we&apos;ll do the maths.
                      </p>
                      <RateForm fileId={f.id} />
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl font-extrabold tracking-tight tabular-nums text-fg">{formatINR(payout.grossPaise, { whole: true })}</div>
                      <dl className="space-y-1.5 text-sm">
                        <Row k={`Rate on ${formatINRShort(f.disbursedPaise)}`} v={f.payoutRateBps ? `${bpsToPercent(f.payoutRateBps)}%` : "—"} />
                        <Row k="+ GST" v={formatINR(payout.gstPaise, { whole: true })} />
                        <Row k="− TDS (194H)" v={formatINR(payout.tdsPaise, { whole: true })} />
                        <Row k={payout.status === "received" ? "Net received" : "Net expected"} v={formatINR(payout.netReceivedPaise ?? netOf(payout), { whole: true })} strong />
                        {payout.subConnectorId ? (
                          <Row
                            k={`Partner share${partner ? ` · ${partner.name}` : ""}`}
                            v={`${formatINR(payout.subConnectorSharePaise, { whole: true })}${payout.subConnectorPaidDate ? " ✓ paid" : ""}`}
                          />
                        ) : null}
                      </dl>
                    </>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {payout.status === "expected" ? <InvoiceButton payout={payout} today={today} /> : null}
                    {payout.status !== "received" ? <ReceiveButton payout={payout} accounts={accounts} today={today} /> : null}
                    {payout.subConnectorId && payout.subConnectorSharePaise > 0 && !payout.subConnectorPaidDate ? (
                      <PartnerPaidButton payout={payout} partnerName={partner?.name ?? "partner"} accounts={accounts} today={today} />
                    ) : null}
                    {payout.status !== "received" ? <EditPayoutButton payout={payout} /> : null}
                  </div>
                  {payout.status === "expected" && payout.grossPaise > 0 ? (
                    <details className="text-xs text-fg-muted">
                      <summary className="cursor-pointer font-semibold">Use a different rate</summary>
                      <div className="mt-2">
                        <RateForm fileId={f.id} current={f.payoutRateBps} />
                      </div>
                    </details>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-fg-muted">
                  {f.stage === "rejected" || f.stage === "dropped"
                    ? "No payout on a closed file."
                    : "When you mark it disbursed, we'll pick the rate from the lender's grid and work out GST, TDS and any partner share."}
                </p>
              )}
            </CardBody>
          </Card>

          {/* Borrower */}
          <Card>
            <CardHeader
              title={
                <Link href={`/dsa/borrowers/${b.id}`} className="hover:text-amber-600 dark:hover:text-amber-300">
                  {b.name}
                </Link>
              }
              description={[b.city, b.employmentType ? EMPLOYMENT_LABELS[b.employmentType as EmploymentType] : null].filter(Boolean).join(" · ") || "Borrower"}
              icon={<UserRound className="h-4.5 w-4.5" />}
            />
            <CardBody className="space-y-3">
              <ContactLinks phone={b.phone} email={b.email} waText={`Hi ${b.name.split(" ")[0]}, `} />
              <dl className="space-y-1.5 text-sm">
                <Row k="Phone" v={b.phone ?? "—"} />
                <Row k="Monthly income" v={formatINR(b.monthlyIncomePaise, { whole: true })} />
                <Row
                  k="CIBIL"
                  v={
                    b.cibilScore ? (
                      <span className={cn("font-bold", b.cibilScore >= 750 ? "text-emerald-600 dark:text-emerald-300" : b.cibilScore >= 700 ? "text-amber-600 dark:text-amber-300" : "text-rose-600 dark:text-rose-300")}>
                        {b.cibilScore}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
                <Row k="Source" v={b.source ?? "—"} />
              </dl>
              {d.otherFiles.length ? (
                <div className="border-t border-line pt-3">
                  <div className="mb-1.5 text-xs font-semibold text-fg-subtle">Other files</div>
                  <ul className="space-y-1">
                    {d.otherFiles.map((o) => (
                      <li key={o.id}>
                        <Link href={`/dsa/files/${o.id}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm hover:bg-muted">
                          <span className="flex items-center gap-1.5">
                            <ProductTag product={o.product} short /> {formatINRShort(o.amount)}
                          </span>
                          <span className="text-xs text-fg-muted">{STAGE_LABELS[o.stage]}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>

          {/* Lender RM */}
          <Card>
            <CardHeader
              title={
                lender ? (
                  <Link href={`/dsa/lenders/${lender.id}`} className="hover:text-amber-600 dark:hover:text-amber-300">
                    {lender.name}
                  </Link>
                ) : (
                  "Lender"
                )
              }
              description={lender ? (lender.rmName ? `RM: ${lender.rmName}` : "No RM saved yet") : "Pick one when you log the file in"}
              icon={<Landmark className="h-4.5 w-4.5" />}
            />
            {lender ? (
              <CardBody className="space-y-3">
                <ContactLinks phone={lender.rmPhone} email={lender.rmEmail} waText={`Hi${lender.rmName ? ` ${lender.rmName.split(" ")[0]}` : ""}, regarding ${b.name}${f.applicationNo ? ` (${f.applicationNo})` : ""}: `} />
                <dl className="space-y-1.5 text-sm">
                  {lender.dsaCode ? <Row k="DSA code" v={<span className="font-mono">{lender.dsaCode}</span>} /> : null}
                  <Row k="Pays out in" v={`${lender.payoutDays} days`} />
                </dl>
              </CardBody>
            ) : null}
          </Card>

          {/* Key dates */}
          <Card>
            <CardHeader title="Key facts" icon={<ClipboardList className="h-4.5 w-4.5" />} />
            <CardBody>
              <dl className="space-y-1.5 text-sm">
                <Row k="Requested" v={formatINR(f.amountRequestedPaise, { whole: true })} />
                <Row k="Logged in" v={formatDay(f.loginDate)} />
                <Row k="Sanctioned" v={f.sanctionedPaise ? `${formatINR(f.sanctionedPaise, { whole: true })} · ${formatDay(f.sanctionDate, { short: true })}` : "—"} />
                <Row k="Disbursed" v={f.disbursedPaise ? `${formatINR(f.disbursedPaise, { whole: true })} · ${formatDay(f.disbursalDate, { short: true })}` : "—"} />
                <Row k="Opened" v={formatDay(toISTDate(f.createdAt))} />
                {partner ? (
                  <Row
                    k="Sub-connector"
                    v={
                      <Link href="/dsa/partners" className="inline-flex items-center gap-1 hover:text-amber-600">
                        <Users className="h-3.5 w-3.5" /> {partner.name} · {bpsToPercent(partner.shareBps)}%
                      </Link>
                    }
                  />
                ) : null}
              </dl>
              {f.notes ? <p className="mt-3 whitespace-pre-line rounded-xl bg-muted/60 p-3 text-sm text-fg-muted">{f.notes}</p> : null}
            </CardBody>
          </Card>

          <Attachments entityType="loan_file" entityId={f.id} path={path} />
        </div>
      </div>
    </>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", strong && "border-t border-line pt-1.5")}>
      <dt className="text-fg-muted">{k}</dt>
      <dd className={cn("text-right tabular-nums text-fg", strong && "font-extrabold")}>{v}</dd>
    </div>
  );
}

function RateForm({ fileId, current }: { fileId: string; current?: number | null }) {
  return (
    <ActionForm action={setPayoutRateAction} className="space-y-2">
      <input type="hidden" name="fileId" value={fileId} />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input name="rate" inputMode="decimal" placeholder="e.g. 0.65" defaultValue={current ? bpsToPercent(current) : ""} required className="pr-8" />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-fg-subtle">%</span>
        </div>
        <SubmitButton variant="primary" className="shrink-0">
          Set rate
        </SubmitButton>
      </div>
      <Checkbox name="saveToGrid" defaultChecked label="Also save to the lender's grid" />
    </ActionForm>
  );
}
