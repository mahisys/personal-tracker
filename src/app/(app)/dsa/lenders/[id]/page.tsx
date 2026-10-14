import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeIndianRupee, CheckCircle2, FolderOpen, Gauge, Grid3x3, Pencil, Plus, Timer, Trash2, UserRound } from "lucide-react";
import type { LoanProduct } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { StatTile } from "@/components/ui/stat";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { History } from "@/components/shared/history";
import { ContactLinks } from "@/components/dsa/contact";
import { LenderFields } from "@/components/dsa/fields";
import { RateFields } from "@/components/dsa/rate-fields";
import { ProductTag, StageBadge } from "@/components/dsa/chips";
import { bpsToPercent, formatINR, formatINRShort } from "@/lib/money";
import { addRateAction, deleteLenderAction, deleteRateAction, updateLenderAction, updateRateAction } from "@/server/dsa/actions";
import { LENDER_TYPE_LABELS, PRODUCT_LABELS, type LenderType } from "@/server/dsa/constants";
import { getLenderDetail } from "@/server/dsa/queries";

export const metadata: Metadata = { title: "Lender" };

function ticketRange(min: number, max: number | null) {
  if (!min && max == null) return "Any amount";
  if (max == null) return `${formatINRShort(min)} and above`;
  if (!min) return `Up to ${formatINRShort(max)}`;
  return `${formatINRShort(min)} – ${formatINRShort(max)}`;
}

export default async function LenderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getLenderDetail(id);
  if (!d) notFound();
  const { lender: l, grid, files, stats } = d;
  const byProduct = new Map<LoanProduct, typeof grid>();
  for (const r of grid) byProduct.set(r.product, [...(byProduct.get(r.product) ?? []), r]);

  const addRate = (
    <Modal
      trigger={
        <>
          <Plus className="h-4 w-4" /> Add rate
        </>
      }
      variant="soft"
      size="sm"
      title="Add a payout slab"
      description="When several slabs match a disbursal, the narrowest ticket range wins."
    >
      <ActionForm action={addRateAction}>
        <input type="hidden" name="lenderId" value={l.id} />
        <RateFields />
        <ModalActions>
          <SubmitButton>Add to grid</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );

  return (
    <>
      <Link href="/dsa/lenders" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted transition hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Lenders
      </Link>
      <PageHeader
        eyebrow={LENDER_TYPE_LABELS[l.type as LenderType]}
        title={
          <span className="flex items-center gap-3">
            {l.name}
            {!l.active ? <Badge>inactive</Badge> : null}
          </span>
        }
        description={l.dsaCode ? `Your DSA code: ${l.dsaCode}` : "Add your DSA code so it's handy at login."}
        actions={
          <>
            <Modal
              trigger={
                <>
                  <Pencil className="h-4 w-4" /> Edit
                </>
              }
              variant="secondary"
              title="Edit lender"
              wide
            >
              <ActionForm action={updateLenderAction} resetOnSuccess={false}>
                <input type="hidden" name="id" value={l.id} />
                <LenderFields l={l} />
                <ModalActions>
                  <SubmitButton>Save</SubmitButton>
                </ModalActions>
              </ActionForm>
            </Modal>
            <ActionButton action={deleteLenderAction} hidden={{ id: l.id }} variant="ghost" size="icon" title="Delete lender" confirm={`Delete ${l.name}?`}>
              <Trash2 className="h-4 w-4" />
            </ActionButton>
          </>
        }
      />

      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Files" value={stats?.files ?? 0} sub={stats?.active ? `${stats.active} active` : "None active"} icon={<FolderOpen className="h-5 w-5" />} tone="warn" />
        <StatTile
          label="Approval rate"
          value={stats?.approval.rate != null ? `${stats.approval.rate}%` : "—"}
          sub={stats?.approval.decided ? `${stats.approval.approved} of ${stats.approval.decided} decided` : "No decisions yet"}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="good"
        />
        <StatTile
          label="Disbursed · earned"
          value={formatINRShort(stats?.disbursed ?? 0)}
          sub={`${formatINR(stats?.earnings ?? 0, { whole: true })} gross payout`}
          icon={<BadgeIndianRupee className="h-5 w-5" />}
          tone="info"
        />
        <StatTile
          label="Login → disbursal"
          value={stats?.avgDays != null ? `${stats.avgDays} days` : "—"}
          sub={`Pays out ~${l.payoutDays} days after`}
          icon={<Gauge className="h-5 w-5" />}
          tone="violet"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="stagger space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Payout grid" description="Commission % on the disbursed amount, by product and ticket size" icon={<Grid3x3 className="h-4.5 w-4.5" />} actions={addRate} />
            <CardBody>
              {grid.length === 0 ? (
                <EmptyState title="No payout slabs yet" description="Add one slab per product (and ticket band) — payouts calculate themselves on disbursal." className="py-8" />
              ) : (
                <div className="space-y-4">
                  {[...byProduct.entries()].map(([product, rows]) => (
                    <div key={product}>
                      <div className="mb-2 flex items-center gap-2">
                        <ProductTag product={product} />
                      </div>
                      <ul className="divide-y divide-line rounded-2xl border border-line">
                        {rows.map((r) => (
                          <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-fg">{ticketRange(r.minTicketPaise, r.maxTicketPaise)}</div>
                              {r.notes ? <div className="truncate text-xs text-fg-subtle">{r.notes}</div> : null}
                            </div>
                            <div className="text-lg font-extrabold tabular-nums text-amber-700 dark:text-amber-300">{bpsToPercent(r.rateBps)}%</div>
                            <Modal trigger={<Pencil className="h-3.5 w-3.5" />} variant="ghost" size="icon" title={`Edit ${PRODUCT_LABELS[r.product]} slab`}>
                              <ActionForm action={updateRateAction} resetOnSuccess={false}>
                                <input type="hidden" name="id" value={r.id} />
                                <RateFields r={r} />
                                <ModalActions>
                                  <SubmitButton>Save</SubmitButton>
                                </ModalActions>
                              </ActionForm>
                            </Modal>
                            <ActionButton action={deleteRateAction} hidden={{ id: r.id }} variant="ghost" size="icon" confirm="Remove this slab?" title="Remove slab">
                              <Trash2 className="h-3.5 w-3.5" />
                            </ActionButton>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Files with this lender" icon={<FolderOpen className="h-4.5 w-4.5" />} />
            <CardBody className="pt-3">
              {files.length === 0 ? (
                <p className="text-sm text-fg-subtle">No files logged with {l.name} yet.</p>
              ) : (
                <TableWrap className="shadow-none">
                  <Table>
                    <THead>
                      <tr>
                        <TH>Borrower</TH>
                        <TH>Product</TH>
                        <TH className="text-right">Amount</TH>
                        <TH>Stage</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {files.map(({ file: f, borrowerName }) => (
                        <TR key={f.id}>
                          <TD>
                            <Link href={`/dsa/files/${f.id}`} className="font-semibold hover:text-amber-600 dark:hover:text-amber-300">
                              {borrowerName}
                            </Link>
                            {f.applicationNo ? <div className="font-mono text-[11px] text-fg-subtle">#{f.applicationNo}</div> : null}
                          </TD>
                          <TD>
                            <ProductTag product={f.product} short />
                          </TD>
                          <TD className="text-right tabular-nums">{formatINRShort(f.disbursedPaise ?? f.sanctionedPaise ?? f.amountRequestedPaise)}</TD>
                          <TD>
                            <StageBadge stage={f.stage} />
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="stagger space-y-6">
          <Card>
            <CardHeader title={l.rmName ?? "Relationship manager"} description={l.rmName ? "Your RM" : "Add your RM's details"} icon={<UserRound className="h-4.5 w-4.5" />} />
            <CardBody className="space-y-3">
              <ContactLinks phone={l.rmPhone} email={l.rmEmail} waText={l.rmName ? `Hi ${l.rmName.split(" ")[0]}, ` : undefined} />
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Phone</dt>
                  <dd className="text-fg">{l.rmPhone ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Email</dt>
                  <dd className="truncate text-fg">{l.rmEmail ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Payout cycle</dt>
                  <dd className="inline-flex items-center gap-1 text-fg">
                    <Timer className="h-3.5 w-3.5" /> {l.payoutDays} days
                  </dd>
                </div>
              </dl>
              {l.notes ? <p className="whitespace-pre-line rounded-xl bg-muted/60 p-3 text-sm text-fg-muted">{l.notes}</p> : null}
            </CardBody>
          </Card>
          <History entityType="lender" entityId={l.id} />
        </div>
      </div>
    </>
  );
}
