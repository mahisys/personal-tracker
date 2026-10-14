import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderOpen, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { requireUser } from "@/server/auth";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { History } from "@/components/shared/history";
import { ActivityLog } from "@/components/dsa/activity-log";
import { ContactLinks } from "@/components/dsa/contact";
import { BorrowerFields } from "@/components/dsa/fields";
import { NewFileForm } from "@/components/dsa/new-file-form";
import { DaysChip, PendingChip, ProductTag, StageBadge } from "@/components/dsa/chips";
import { cn } from "@/lib/cn";
import { formatDay, todayIST, toISTDate } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";
import { deleteBorrowerAction, updateBorrowerAction } from "@/server/dsa/actions";
import { EMPLOYMENT_LABELS, isActiveStage, type EmploymentType } from "@/server/dsa/constants";
import { stageStaleness } from "@/server/dsa/logic";
import { getBorrowerDetail, lenderOptions, partnerOptions } from "@/server/dsa/queries";

export const metadata: Metadata = { title: "Borrower" };

export default async function BorrowerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [d, partners, lenders] = await Promise.all([getBorrowerDetail(id), partnerOptions(), lenderOptions()]);
  if (!d) notFound();
  const { borrower: b, partner } = d;
  const today = todayIST();
  const disbursed = d.files.reduce((s, f) => s + (f.file.disbursedPaise ?? 0), 0);

  const newFile = (
    <Modal
      trigger={
        <>
          <Plus className="h-4 w-4" /> New file
        </>
      }
      title={`New file for ${b.name}`}
      wide
    >
      <NewFileForm borrowers={[]} borrowerId={b.id} lenders={lenders} partners={partners} />
    </Modal>
  );

  return (
    <>
      <Link href="/dsa/borrowers" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted transition hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Borrowers
      </Link>
      <PageHeader
        eyebrow="Borrower"
        title={b.name}
        description={[b.city, b.employmentType ? EMPLOYMENT_LABELS[b.employmentType as EmploymentType] : null, b.source ? `via ${b.source}` : null].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <Modal
              trigger={
                <>
                  <Pencil className="h-4 w-4" /> Edit
                </>
              }
              variant="secondary"
              title="Edit borrower"
              wide
            >
              <ActionForm action={updateBorrowerAction} resetOnSuccess={false}>
                <input type="hidden" name="id" value={b.id} />
                <BorrowerFields b={b} partners={partners} />
                <ModalActions>
                  <SubmitButton>Save</SubmitButton>
                </ModalActions>
              </ActionForm>
            </Modal>
            <ActionButton action={deleteBorrowerAction} hidden={{ id: b.id }} variant="ghost" size="icon" title="Delete borrower" confirm={`Delete ${b.name} and all their files? This can't be undone.`}>
              <Trash2 className="h-4 w-4" />
            </ActionButton>
            {newFile}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="stagger space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Loan files" icon={<FolderOpen className="h-4.5 w-4.5" />} description={d.files.length ? `${d.files.length} across ${new Set(d.files.map((f) => f.lenderName ?? "—")).size} lender(s)` : undefined} />
            <CardBody>
              {d.files.length === 0 ? (
                <EmptyState title="No files yet" description="Open their first loan file — the checklist builds itself." action={newFile} className="py-8" />
              ) : (
                <ul className="stagger space-y-2">
                  {d.files.map(({ file: f, lenderName }) => {
                    const st = stageStaleness(f.stage, f.stageChangedAt, today);
                    return (
                      <li key={f.id}>
                        <Link href={`/dsa/files/${f.id}`} className="flex flex-col gap-2 rounded-2xl border border-line bg-solid/60 p-3 transition hover:-translate-y-0.5 hover:shadow-card sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <ProductTag product={f.product} />
                              <span className="font-extrabold tabular-nums text-fg">{formatINRShort(f.disbursedPaise ?? f.sanctionedPaise ?? f.amountRequestedPaise)}</span>
                            </div>
                            <div className="mt-1 text-xs text-fg-muted">
                              {lenderName ?? "Lender not picked"} · opened {formatDay(toISTDate(f.createdAt), { short: true })}
                              {f.applicationNo ? ` · #${f.applicationNo}` : ""}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StageBadge stage={f.stage} />
                            {isActiveStage(f.stage) ? (
                              <>
                                <DaysChip days={st.days} level={st.level} limit={st.limit} />
                                <PendingChip pendingWith={f.pendingWith} />
                              </>
                            ) : null}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
          <ActivityLog items={d.activities} borrowerId={b.id} title="Calls, visits & notes" />
          <History entityType="borrower" entityId={b.id} />
        </div>
        <div className="stagger space-y-6">
          <Card>
            <CardHeader title="Contact" icon={<UserRound className="h-4.5 w-4.5" />} />
            <CardBody className="space-y-4">
              <ContactLinks phone={b.phone} email={b.email} waText={`Hi ${b.name.split(" ")[0]}, `} />
              <dl className="space-y-1.5 text-sm">
                {[
                  ["Phone", b.phone ?? "—"],
                  ["Email", b.email ?? "—"],
                  ["City", b.city ?? "—"],
                  ["Monthly income", formatINR(b.monthlyIncomePaise, { whole: true })],
                  ["Sub-connector", partner?.name ?? "—"],
                  ["Total disbursed", formatINR(disbursed, { whole: true })],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-fg-muted">{k}</dt>
                    <dd className="truncate text-right text-fg">{v}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">CIBIL</dt>
                  <dd
                    className={cn(
                      "font-bold",
                      !b.cibilScore ? "text-fg" : b.cibilScore >= 750 ? "text-emerald-600 dark:text-emerald-300" : b.cibilScore >= 700 ? "text-amber-600 dark:text-amber-300" : "text-rose-600 dark:text-rose-300",
                    )}
                  >
                    {b.cibilScore ?? "—"}
                  </dd>
                </div>
              </dl>
              {b.notes ? <p className="whitespace-pre-line rounded-xl bg-muted/60 p-3 text-sm text-fg-muted">{b.notes}</p> : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
