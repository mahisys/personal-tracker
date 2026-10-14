import Link from "next/link";
import type { Metadata } from "next";
import { Building2, Landmark, Plus, Timer } from "lucide-react";
import { requireUser } from "@/server/auth";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { DsaNav } from "@/components/dsa/nav";
import { LenderFields } from "@/components/dsa/fields";
import { cn } from "@/lib/cn";
import { formatINRShort } from "@/lib/money";
import { createLenderAction } from "@/server/dsa/actions";
import { LENDER_TYPE_LABELS, type LenderType } from "@/server/dsa/constants";
import { listLenders } from "@/server/dsa/queries";

export const metadata: Metadata = { title: "Lenders" };

export default async function LendersPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const rows = await listLenders();

  const add = (
    <Modal
      trigger={
        <>
          <Plus className="h-4 w-4" /> Add lender
        </>
      }
      title="Add a lender"
      description="Banks, NBFCs and HFCs you're empanelled with."
      defaultOpen={sp.new === "1"}
      wide
    >
      <ActionForm action={createLenderAction}>
        <LenderFields />
        <ModalActions>
          <SubmitButton>Add lender</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );

  return (
    <>
      <PageHeader eyebrow="Loan DSA" title="Lenders" description="Your empanelments, RMs and payout grids — and who actually approves your files." actions={add} />
      <DsaNav active="/dsa/lenders" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-6 w-6" />}
          title="No lenders yet"
          description="Add the banks and NBFCs you work with, then set their payout grid so commissions calculate themselves."
          action={
            <Link href="/dsa/lenders?new=1" className="font-semibold text-brand hover:underline">
              Add your first lender
            </Link>
          }
        />
      ) : (
        <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ lender: l, gridRows, stats }) => (
            <Link key={l.id} href={`/dsa/lenders/${l.id}`}>
              <Card interactive className={cn("h-full p-4", !l.active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-700 dark:text-amber-300">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold text-fg">{l.name}</span>
                      {!l.active ? <Badge>inactive</Badge> : null}
                    </div>
                    <div className="truncate text-xs text-fg-muted">
                      {LENDER_TYPE_LABELS[l.type as LenderType]}
                      {l.rmName ? ` · RM ${l.rmName}` : ""}
                    </div>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted/70 px-2 py-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Files</dt>
                    <dd className="text-base font-extrabold tabular-nums text-fg">{stats?.files ?? 0}</dd>
                  </div>
                  <div className="rounded-xl bg-muted/70 px-2 py-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Approval</dt>
                    <dd className="text-base font-extrabold tabular-nums text-fg">{stats?.approval.rate != null ? `${stats.approval.rate}%` : "—"}</dd>
                  </div>
                  <div className="rounded-xl bg-muted/70 px-2 py-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Earned</dt>
                    <dd className="text-base font-extrabold tabular-nums text-fg">{stats?.earnings ? formatINRShort(stats.earnings) : "—"}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-between text-xs text-fg-muted">
                  <span className="inline-flex items-center gap-1">
                    <Timer className="h-3.5 w-3.5" /> Pays in {l.payoutDays}d
                  </span>
                  {gridRows ? <span>{gridRows} grid row{gridRows === 1 ? "" : "s"}</span> : <span className="font-semibold text-amber-700 dark:text-amber-300">Set payout grid</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
