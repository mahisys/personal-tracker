import Link from "next/link";
import type { Metadata } from "next";
import { Handshake, Pencil, Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { Progress } from "@/components/ui/stat";
import { DsaNav } from "@/components/dsa/nav";
import { PartnerFields } from "@/components/dsa/fields";
import { ContactLinks } from "@/components/dsa/contact";
import { ProductTag, StageBadge } from "@/components/dsa/chips";
import { PartnerPaidButton } from "@/components/dsa/payout-forms";
import { cn } from "@/lib/cn";
import { todayIST } from "@/lib/dates";
import { bpsToPercent, formatINR, formatINRShort } from "@/lib/money";
import { createPartnerAction, deletePartnerAction, updatePartnerAction } from "@/server/dsa/actions";
import { accountOptions, listPartners, listPayouts } from "@/server/dsa/queries";

export const metadata: Metadata = { title: "Partners" };

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const today = todayIST();
  const [rows, accounts, allPayouts] = await Promise.all([listPartners(), accountOptions(), listPayouts()]);
  const payoutById = new Map(allPayouts.map((p) => [p.payout.id, p.payout]));
  const totalEarned = rows.reduce((s, r) => s + r.earned, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);

  return (
    <>
      <PageHeader
        eyebrow="Loan DSA"
        title="Partners"
        description="Sub-connectors who bring you files — their share, worked out on every payout."
        actions={
          <Modal
            trigger={
              <>
                <Plus className="h-4 w-4" /> Add partner
              </>
            }
            title="Add a sub-connector"
            defaultOpen={sp.new === "1"}
          >
            <ActionForm action={createPartnerAction}>
              <PartnerFields />
              <ModalActions>
                <SubmitButton>Add partner</SubmitButton>
              </ModalActions>
            </ActionForm>
          </Modal>
        }
      />
      <DsaNav active="/dsa/partners" />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-6 w-6" />}
          title="No partners yet"
          description="Add sub-connectors who refer borrowers to you. Tag them on a borrower and their share is calculated on every payout."
        />
      ) : (
        <>
          {totalEarned ? (
            <Card className="mb-6 animate-fade-up p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-fg-muted">Partner shares, all time</div>
                  <div className="text-2xl font-extrabold tabular-nums text-fg">{formatINR(totalEarned, { whole: true })}</div>
                </div>
                <div className="text-sm text-fg-muted">
                  <b className="text-emerald-600 dark:text-emerald-300">{formatINRShort(totalPaid)}</b> paid · <b className="text-amber-700 dark:text-amber-300">{formatINRShort(totalEarned - totalPaid)}</b> to pay
                </div>
              </div>
              <Progress value={(totalPaid / totalEarned) * 100} tone="good" className="mt-3" />
            </Card>
          ) : null}
          <div className="stagger grid gap-4 lg:grid-cols-2">
            {rows.map(({ partner: p, files, earned, paid, unpaid }) => (
              <Card key={p.id} className={cn(!p.active && "opacity-70")}>
                <CardBody>
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-700 dark:text-amber-300">
                      <Handshake className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-bold text-fg">{p.name}</span>
                        <Badge tone="warn">{bpsToPercent(p.shareBps)}% share</Badge>
                        {!p.active ? <Badge>inactive</Badge> : null}
                      </div>
                      <div className="text-xs text-fg-muted">{p.phone ?? "No phone"}</div>
                    </div>
                    <div className="flex items-center">
                      <Modal trigger={<Pencil className="h-4 w-4" />} variant="ghost" size="icon" title={`Edit ${p.name}`}>
                        <ActionForm action={updatePartnerAction} resetOnSuccess={false}>
                          <input type="hidden" name="id" value={p.id} />
                          <PartnerFields p={p} />
                          <ModalActions>
                            <SubmitButton>Save</SubmitButton>
                          </ModalActions>
                        </ActionForm>
                      </Modal>
                      <ActionButton action={deletePartnerAction} hidden={{ id: p.id }} variant="ghost" size="icon" confirm={`Remove ${p.name}?`} title="Remove partner">
                        <Trash2 className="h-4 w-4" />
                      </ActionButton>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Files", String(files.length)],
                      ["Earned", formatINRShort(earned)],
                      ["Pending", formatINRShort(earned - paid)],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-muted/70 px-2 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">{k}</dt>
                        <dd className="text-base font-extrabold tabular-nums text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  {unpaid.length ? (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-semibold text-fg-subtle">To pay</div>
                      {unpaid.map((u) => {
                        const payout = payoutById.get(u.id);
                        return (
                          <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                            <Link href={`/dsa/files/${u.fileId}`} className="min-w-0 truncate text-sm hover:text-amber-600">
                              {u.borrowerName} · <b className="tabular-nums">{formatINR(u.share, { whole: true })}</b>
                              {u.status !== "received" ? <span className="text-xs text-fg-subtle"> (lender {u.status})</span> : null}
                            </Link>
                            {payout ? <PartnerPaidButton payout={payout} partnerName={p.name} accounts={accounts} today={today} /> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {files.length ? (
                    <div className="mt-4">
                      <div className="mb-1.5 text-xs font-semibold text-fg-subtle">Their files</div>
                      <ul className="space-y-1">
                        {files.slice(0, 6).map((f) => (
                          <li key={f.id}>
                            <Link href={`/dsa/files/${f.id}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm hover:bg-muted">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate">{f.borrowerName}</span>
                                <ProductTag product={f.product} short />
                              </span>
                              <StageBadge stage={f.stage} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {files.length > 6 ? <p className="mt-1 text-xs text-fg-subtle">+{files.length - 6} more</p> : null}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-fg-subtle">No files yet — tag them on a borrower to start tracking.</p>
                  )}
                  {p.phone ? (
                    <div className="mt-4">
                      <ContactLinks phone={p.phone} />
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
