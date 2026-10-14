import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDownLeft, ArrowLeft, ArrowUpRight, Pencil, Plus, ScrollText, Trash2, Upload } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getAccount, getAccountTxnCounts, listAccountOptions, listCategories, listTransactions } from "@/server/books/queries";
import { deleteAccount, toggleArchiveAccount } from "@/server/books/actions";
import { balanceSeries, buildStatement, monthRange } from "@/server/books/calc";
import { formatDay, monthKey, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/cn";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ActionButton } from "@/components/client/action-form";
import { History } from "@/components/shared/history";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { AccountIcon, accountTypeLabel } from "@/components/books/meta";
import { AccountDialog } from "@/components/books/account-dialog";
import { TransactionDialog, type AccountOption, type CategoryOption } from "@/components/books/transaction-dialog";
import { BalanceChart } from "@/components/books/charts";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const account = await getAccount(id);
  if (!account) notFound();

  const [txns, counts, accountOptions, categories] = await Promise.all([
    listTransactions({ accountId: id }, 5000),
    getAccountTxnCounts([id]),
    listAccountOptions(),
    listCategories(),
  ]);
  const statement = buildStatement(account, txns);
  const balance = statement.at(-1)?.balancePaise ?? account.openingBalancePaise;
  const debt = account.type === "credit_card" || account.type === "loan";
  const owed = Math.max(0, -balance);
  const { from } = monthRange(monthKey(todayIST()));
  const thisMonth = statement.filter((r) => r.date >= from);
  const inflow = thisMonth.filter((r) => r.effectPaise > 0).reduce((s, r) => s + r.effectPaise, 0);
  const outflow = thisMonth.filter((r) => r.effectPaise < 0).reduce((s, r) => s - r.effectPaise, 0);
  const series = balanceSeries({ date: account.openingDate, balancePaise: account.openingBalancePaise }, statement);
  const recent = [...statement].reverse().slice(0, 300);
  const hasEntries = (counts.get(id) ?? 0) > 0;
  const accts = accountOptions as AccountOption[];
  const cats = categories as CategoryOption[];

  return (
    <>
      <Link href="/books/accounts" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-fg-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Accounts
      </Link>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            {accountTypeLabel(account.type)}
            {account.workspace ? <WorkspaceBadge ws={account.workspace} /> : null}
            {account.archived ? <Badge>Archived</Badge> : null}
          </span>
        }
        title={
          <span className="flex items-center gap-3">
            <AccountIcon type={account.type} />
            <span className="truncate">{account.name}{account.last4 ? <span className="ml-2 text-lg text-fg-subtle">••{account.last4}</span> : null}</span>
          </span>
        }
        description={account.institution ? `${account.institution} · opened in books on ${formatDay(account.openingDate)}` : `Tracked since ${formatDay(account.openingDate)}`}
        actions={
          <>
            {!account.archived ? (
              <TransactionDialog
                trigger={<><Plus className="h-4 w-4" /> Add entry</>}
                accounts={accts}
                categories={cats}
                defaults={{ type: "expense", accountId: id, workspace: account.workspace ?? "personal" }}
              />
            ) : null}
            <AccountDialog
              trigger={<><Pencil className="h-4 w-4" /> Edit</>}
              variant="secondary"
              defaults={{ ...account }}
            />
            <ActionButton action={toggleArchiveAccount} hidden={{ id }} variant="ghost" size="md" title={account.archived ? "Restore" : "Archive"}>
              {account.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </ActionButton>
            {!hasEntries ? (
              <ActionButton action={deleteAccount} hidden={{ id }} variant="danger" size="md" confirm="Delete this account?" title="Delete account">
                <Trash2 className="h-4 w-4" />
              </ActionButton>
            ) : null}
          </>
        }
      />

      <div className="stagger mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatTile
          className="col-span-2 lg:col-span-1"
          label={debt ? (owed ? "You owe" : "Balance") : "Balance today"}
          value={<span className={cn(debt && owed ? "text-rose-600 dark:text-rose-400" : balance < 0 ? "text-rose-600 dark:text-rose-400" : undefined)}>{formatINR(debt ? owed || balance : balance)}</span>}
          sub={debt && account.creditLimitPaise ? `${formatINR(Math.max(0, account.creditLimitPaise - owed), { whole: true })} available of ${formatINR(account.creditLimitPaise, { whole: true })}` : `${statement.length} entries`}
          tone={debt ? (owed ? "bad" : "good") : "brand"}
        />
        <StatTile label="In this month" value={formatINR(inflow, { whole: true })} icon={<ArrowDownLeft className="h-5 w-5" />} tone="good" />
        <StatTile label="Out this month" value={formatINR(outflow, { whole: true })} icon={<ArrowUpRight className="h-5 w-5" />} tone="bad" />
      </div>

      {series.length > 1 ? (
        <Card className="mb-6 animate-fade-up">
          <CardHeader title={debt ? "Amount owed over time" : "Balance over time"} />
          <CardBody>
            <BalanceChart data={series} negativeIsDebt={debt} />
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-fg-muted">Statement</h2>
            <LinkButton href={`/books/transactions?accountId=${id}&from=&to=`} variant="ghost" size="sm">Open in transactions</LinkButton>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-6 w-6" />}
              title="No entries yet"
              description="Add an entry or import this account's statement."
              action={<LinkButton href="/books/import" variant="soft"><Upload className="h-4 w-4" /> Import statement</LinkButton>}
            />
          ) : (
            <TableWrap className="animate-fade-up">
              <Table className="min-w-[560px]">
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Details</TH>
                    <TH className="text-right">Amount</TH>
                    <TH className="text-right">Balance</TH>
                  </tr>
                </THead>
                <tbody>
                  {recent.map((r) => (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap text-fg-muted">{formatDay(r.date, { short: true })}</TD>
                      <TD className="max-w-[260px]">
                        <div className="truncate font-semibold">{r.type === "transfer" ? (r.effectPaise > 0 ? `From ${r.accountName}` : `To ${r.toAccountName}`) : r.party || r.description || r.categoryName || "Entry"}</div>
                        <div className="truncate text-xs text-fg-subtle">{r.type === "transfer" ? "Transfer" : r.categoryName ?? "Uncategorised"}{r.party && r.description ? ` · ${r.description}` : ""}</div>
                      </TD>
                      <TD className={cn("whitespace-nowrap text-right font-bold tabular-nums", r.effectPaise > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {r.effectPaise > 0 ? "+" : "−"}
                        {formatINR(Math.abs(r.effectPaise))}
                      </TD>
                      <TD className={cn("whitespace-nowrap text-right tabular-nums", r.balancePaise < 0 ? "text-rose-600 dark:text-rose-400" : "text-fg")}>{formatINR(r.balancePaise)}</TD>
                    </TR>
                  ))}
                  <TR>
                    <TD className="whitespace-nowrap text-fg-muted">{formatDay(account.openingDate, { short: true })}</TD>
                    <TD className="font-semibold text-fg-muted">Opening balance</TD>
                    <TD />
                    <TD className="text-right tabular-nums text-fg-muted">{formatINR(account.openingBalancePaise)}</TD>
                  </TR>
                </tbody>
              </Table>
            </TableWrap>
          )}
          {statement.length > recent.length ? <p className="mt-2 text-center text-xs text-fg-subtle">Showing the latest {recent.length} of {statement.length} entries.</p> : null}
        </div>
        <div>
          <History entityType="account" entityId={id} />
        </div>
      </div>
    </>
  );
}
