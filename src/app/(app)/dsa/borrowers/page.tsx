import Link from "next/link";
import type { Metadata } from "next";
import { Search, UserPlus, Users } from "lucide-react";
import { requireUser } from "@/server/auth";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { DsaNav } from "@/components/dsa/nav";
import { BorrowerFields } from "@/components/dsa/fields";
import { cn } from "@/lib/cn";
import { formatINRShort } from "@/lib/money";
import { createBorrowerAction } from "@/server/dsa/actions";
import { EMPLOYMENT_LABELS, type EmploymentType } from "@/server/dsa/constants";
import { listBorrowers, partnerOptions } from "@/server/dsa/queries";

export const metadata: Metadata = { title: "Borrowers" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default async function BorrowersPage({ searchParams }: { searchParams: Promise<{ q?: string; new?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const [rows, partners] = await Promise.all([listBorrowers(q), partnerOptions()]);

  const add = (
    <Modal
      trigger={
        <>
          <UserPlus className="h-4 w-4" /> Add borrower
        </>
      }
      title="Add a borrower"
      description="You can open a loan file for them right after."
      defaultOpen={sp.new === "1"}
      wide
    >
      <ActionForm action={createBorrowerAction}>
        <BorrowerFields partners={partners} />
        <ModalActions>
          <SubmitButton>Add borrower</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );

  return (
    <>
      <PageHeader eyebrow="Loan DSA" title="Borrowers" description="Everyone you've sourced, with every file across every lender." actions={add} />
      <DsaNav active="/dsa/borrowers" />

      <form className="relative mb-5 max-w-md animate-fade-up" action="/dsa/borrowers">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input name="q" defaultValue={q} placeholder="Search name, phone, city or email" className="pl-10" />
      </form>

      {rows.length === 0 ? (
        q ? (
          <EmptyState icon={<Search className="h-6 w-6" />} title={`No one matches “${q}”`} description="Try a phone number or part of the name." />
        ) : (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No borrowers yet" description="Add your first borrower — or open a file and add them inline." action={<LinkButton href="/dsa?new=1">Open a loan file</LinkButton>} />
        )
      ) : (
        <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ borrower: b, partnerName, files, active, disbursed }) => (
            <Link key={b.id} href={`/dsa/borrowers/${b.id}`}>
              <Card interactive className="flex h-full items-start gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#f97316)] text-sm font-extrabold text-white shadow-[0_8px_18px_-8px_#f59e0b]">
                  {initials(b.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-fg">{b.name}</div>
                  <div className="truncate text-xs text-fg-muted">
                    {[b.phone, b.city, b.employmentType ? EMPLOYMENT_LABELS[b.employmentType as EmploymentType] : null].filter(Boolean).join(" · ") || "No details yet"}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                    <span className={cn("rounded-full px-2 py-0.5", active ? "bg-amber-500/12 text-amber-800 dark:text-amber-300" : "bg-muted text-fg-muted")}>
                      {files} file{files === 1 ? "" : "s"}
                      {active ? ` · ${active} active` : ""}
                    </span>
                    {disbursed ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">{formatINRShort(disbursed)} disbursed</span> : null}
                    {b.cibilScore ? <span className="rounded-full bg-muted px-2 py-0.5 text-fg-muted">CIBIL {b.cibilScore}</span> : null}
                    {partnerName ? <span className="rounded-full bg-muted px-2 py-0.5 text-fg-muted">via {partnerName}</span> : null}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
