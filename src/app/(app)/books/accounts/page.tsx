import Link from "next/link";
import { Archive, ArchiveRestore, ChevronRight, Plus, Wallet } from "lucide-react";
import type { AccountType } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { liquidBalance } from "@/server/ledger";
import { getAccountsWithBalances } from "@/server/books/queries";
import { toggleArchiveAccount } from "@/server/books/actions";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/cn";
import { PageHeader, EmptyState, Section } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/stat";
import { ActionButton } from "@/components/client/action-form";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { AccountIcon, BooksNav, accountTypeLabel } from "@/components/books/meta";
import { AccountDialog } from "@/components/books/account-dialog";

const GROUPS: { label: string; types: AccountType[] }[] = [
  { label: "Money you have", types: ["bank", "cash", "upi", "wallet"] },
  { label: "Money you owe", types: ["credit_card", "loan"] },
];

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const ws = await getWorkspaceFilter();
  const all = await getAccountsWithBalances(ws, { includeArchived: true });
  const active = all.filter((a) => !a.archived);
  const archived = all.filter((a) => a.archived);
  const liquid = liquidBalance(active);
  const owed = active.filter((a) => a.type === "credit_card" || a.type === "loan").reduce((s, a) => s + Math.max(0, -a.balancePaise), 0);

  return (
    <>
      <PageHeader
        eyebrow="Books"
        title="Accounts"
        description="Your banks, cash, UPI, wallets, cards and loans."
        actions={<AccountDialog key={String(sp.new)} trigger={<><Plus className="h-4 w-4" /> Add account</>} defaultOpen={sp.new === "1"} defaults={{ workspace: ws }} />}
      />
      <BooksNav active="/books/accounts" />

      {all.length === 0 ? (
        <EmptyState icon={<Wallet className="h-6 w-6" />} title="No accounts yet" description="Add the places your money lives — a bank account, cash, UPI or a credit card." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 animate-fade-up">
            <Card className="p-4">
              <div className="text-xs font-semibold text-fg-muted">You have</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-fg">{formatINR(liquid, { whole: true })}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-semibold text-fg-muted">You owe</div>
              <div className={cn("mt-1 text-2xl font-extrabold tabular-nums", owed ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>{formatINR(owed, { whole: true })}</div>
            </Card>
          </div>
          {GROUPS.map((g) => {
            const list = active.filter((a) => g.types.includes(a.type));
            if (list.length === 0) return null;
            return (
              <Section key={g.label} title={g.label}>
                <Card className="stagger divide-y divide-line overflow-hidden">
                  {list.map((a) => {
                    const debt = a.type === "credit_card" || a.type === "loan";
                    const due = Math.max(0, -a.balancePaise);
                    const used = debt && a.creditLimitPaise ? Math.round((due / a.creditLimitPaise) * 100) : null;
                    return (
                      <Link key={a.id} href={`/books/accounts/${a.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-brand-soft/50">
                        <AccountIcon type={a.type} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-semibold text-fg">{a.name}</span>
                            {a.last4 ? <span className="text-xs text-fg-subtle">••{a.last4}</span> : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                            {accountTypeLabel(a.type)}
                            {a.institution ? <span>· {a.institution}</span> : null}
                            {a.workspace ? <WorkspaceBadge ws={a.workspace} /> : <Badge className="px-2 py-0 text-[10px]">Shared</Badge>}
                          </div>
                          {used != null ? <Progress className="mt-2 h-1.5 max-w-48" value={used} tone={used >= 80 ? "bad" : used >= 50 ? "warn" : "good"} /> : null}
                        </div>
                        <div className="text-right">
                          <div className={cn("font-extrabold tabular-nums", debt ? (due ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400") : a.balancePaise < 0 ? "text-rose-600 dark:text-rose-400" : "text-fg")}>
                            {formatINR(debt ? (due || a.balancePaise) : a.balancePaise, { whole: true })}
                          </div>
                          <div className="text-[11px] text-fg-subtle">{debt ? (due ? (used != null ? `${used}% of limit` : "owed") : "all clear") : "balance"}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" />
                      </Link>
                    );
                  })}
                </Card>
              </Section>
            );
          })}
          {archived.length ? (
            <Section title="Archived">
              <Card className="divide-y divide-line overflow-hidden opacity-80">
                {archived.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <AccountIcon type={a.type} className="grayscale" />
                    <Link href={`/books/accounts/${a.id}`} className="min-w-0 flex-1 truncate font-semibold text-fg-muted hover:text-fg">{a.name}</Link>
                    <span className="text-sm tabular-nums text-fg-muted">{formatINR(a.balancePaise, { whole: true })}</span>
                    <ActionButton action={toggleArchiveAccount} hidden={{ id: a.id }} variant="ghost" size="sm" title="Restore account">
                      <ArchiveRestore className="h-4 w-4" /> Restore
                    </ActionButton>
                  </div>
                ))}
              </Card>
            </Section>
          ) : null}
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle"><Archive className="h-3.5 w-3.5" /> Archive accounts you no longer use — their history stays in your books.</p>
        </>
      )}
    </>
  );
}
