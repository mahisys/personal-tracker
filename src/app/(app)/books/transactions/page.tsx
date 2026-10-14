import Link from "next/link";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, FileText, Landmark, Pencil, Plus, Receipt, Search, Trash2, Upload } from "lucide-react";
import { TRANSACTION_TYPES, WORKSPACE_KEYS, type TransactionType, type WorkspaceKey } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { getTransactionTotals, listAccountOptions, listCategories, listTransactions, type TxnFilters, type TxnRow } from "@/server/books/queries";
import { deleteTransaction } from "@/server/books/actions";
import { addMonths, endOfMonth, financialYear, formatDay, relativeDay, startOfMonth, todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { WORKSPACE_OPTIONS } from "@/lib/workspaces";
import { cn } from "@/lib/cn";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/client/action-form";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { BooksNav } from "@/components/books/meta";
import { TransactionDialog, type AccountOption, type CategoryOption } from "@/components/books/transaction-dialog";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;
const isDay = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function quickRanges(today: string) {
  const thisStart = startOfMonth(today);
  const lastStart = addMonths(thisStart, -1);
  const fy = financialYear(today);
  return [
    { label: "This month", from: thisStart, to: endOfMonth(today) },
    { label: "Last month", from: lastStart, to: endOfMonth(lastStart) },
    { label: "Last 3 months", from: addMonths(thisStart, -2), to: endOfMonth(today) },
    { label: fy.label, from: fy.start, to: fy.end },
    { label: "All time", from: "", to: "" },
  ];
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const globalWs = await getWorkspaceFilter();
  const today = todayIST();
  const wsParam = one(sp.ws);
  const ws: WorkspaceKey | null = wsParam === "all" ? null : WORKSPACE_KEYS.includes(wsParam as WorkspaceKey) ? (wsParam as WorkspaceKey) : globalWs;
  const typeParam = one(sp.type);
  const hasRange = "from" in sp || "to" in sp;
  const filters: TxnFilters = {
    from: hasRange ? isDay(one(sp.from)) : startOfMonth(today),
    to: hasRange ? isDay(one(sp.to)) : endOfMonth(today),
    ws,
    accountId: one(sp.accountId),
    categoryId: one(sp.categoryId),
    type: TRANSACTION_TYPES.includes(typeParam as TransactionType) ? (typeParam as TransactionType) : null,
    q: one(sp.q),
  };

  const [rows, totals, accountOptions, categories] = await Promise.all([listTransactions(filters), getTransactionTotals(filters), listAccountOptions(), listCategories()]);

  const params = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | null | undefined> = {
      from: filters.from ?? "",
      to: filters.to ?? "",
      ws: wsParam,
      accountId: filters.accountId,
      categoryId: filters.categoryId,
      type: filters.type,
      q: filters.q,
      ...over,
    };
    for (const [k, v] of Object.entries(base)) if (v != null && (v !== "" || k === "from" || k === "to")) p.set(k, v);
    return `/books/transactions?${p.toString()}`;
  };

  const byDate = new Map<string, TxnRow[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  const net = totals.incomePaise - totals.expensePaise;
  const filtered = !!(filters.accountId || filters.categoryId || filters.type || filters.q || wsParam);

  return (
    <>
      <PageHeader
        eyebrow="Books"
        title="Transactions"
        description="Search, filter and tidy up every entry."
        actions={
          <>
            <TransactionDialog
              trigger={<><ArrowLeftRight className="h-4 w-4" /> Transfer</>}
              title="Move money"
              description="Between your own accounts — not income or expense."
              variant="secondary"
              accounts={accountOptions as AccountOption[]}
              categories={categories as CategoryOption[]}
              defaults={{ type: "transfer", workspace: ws ?? "personal" }}
              lockType
            />
            <TransactionDialog
              trigger={<><Plus className="h-4 w-4" /> Add entry</>}
              accounts={accountOptions as AccountOption[]}
              categories={categories as CategoryOption[]}
              defaults={{ type: "expense", workspace: ws ?? "personal" }}
            />
          </>
        }
      />
      <BooksNav active="/books/transactions" />

      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {quickRanges(today).map((r) => {
          const on = (filters.from ?? "") === r.from && (filters.to ?? "") === r.to;
          return (
            <Link key={r.label} href={params({ from: r.from, to: r.to })} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition", on ? "bg-brand text-white shadow-md" : "bg-muted text-fg-muted hover:bg-brand-soft hover:text-fg")}>
              {r.label}
            </Link>
          );
        })}
      </div>

      <Card className="mb-4 p-4 animate-fade-up">
        <form method="get" action="/books/transactions" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <div className="relative col-span-2 lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input name="q" defaultValue={filters.q ?? ""} placeholder="Search party, note, ref" className="pl-9" aria-label="Search" />
          </div>
          <Input type="date" name="from" defaultValue={filters.from ?? ""} aria-label="From date" />
          <Input type="date" name="to" defaultValue={filters.to ?? ""} aria-label="To date" />
          <Select name="type" defaultValue={filters.type ?? ""} aria-label="Type">
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
          </Select>
          <Select name="accountId" defaultValue={filters.accountId ?? ""} aria-label="Account">
            <option value="">All accounts</option>
            {accountOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Select name="categoryId" defaultValue={filters.categoryId ?? ""} aria-label="Category">
            <option value="">All categories</option>
            <option value="none">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.kind === "income" ? "↓ " : "↑ "}{c.name}</option>
            ))}
          </Select>
          <Select name="ws" defaultValue={wsParam ?? ""} aria-label="Workspace">
            <option value="">{globalWs ? `Workspace: ${WORKSPACE_OPTIONS.find((o) => o.value === globalWs)?.label}` : "All workspaces"}</option>
            <option value="all">All workspaces</option>
            {WORKSPACE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <div className="col-span-2 flex gap-2 md:col-span-4 lg:col-span-8 lg:justify-end">
            {filtered ? <LinkButton href={params({ accountId: null, categoryId: null, type: null, q: null, ws: null })} variant="ghost" size="sm">Clear filters</LinkButton> : null}
            <Button type="submit" size="sm" variant="soft">Apply</Button>
          </div>
        </form>
      </Card>

      <div className="stagger mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TotalChip label="Money in" value={formatINR(totals.incomePaise, { whole: true })} className="text-emerald-600 dark:text-emerald-400" />
        <TotalChip label="Money out" value={formatINR(totals.expensePaise, { whole: true })} className="text-rose-600 dark:text-rose-400" />
        <TotalChip label="Net" value={`${net >= 0 ? "+" : "−"}${formatINR(Math.abs(net), { whole: true })}`} className={net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"} />
        <TotalChip label={`${totals.count} entr${totals.count === 1 ? "y" : "ies"}`} value={totals.gstPaise || totals.tdsPaise ? `GST ${formatINR(totals.gstPaise, { whole: true })} · TDS ${formatINR(totals.tdsPaise, { whole: true })}` : "No GST/TDS"} className="text-sm text-fg" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title={filtered ? "Nothing matches those filters" : "No entries in this period"}
          description={filtered ? "Try a wider date range or clear a filter." : "Add an expense or income, or import a bank statement to fill this in quickly."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <LinkButton href="/books/import" variant="soft"><Upload className="h-4 w-4" /> Import statement</LinkButton>
              <LinkButton href="/books?new=expense">Add an expense</LinkButton>
            </div>
          }
        />
      ) : (
        <div className="space-y-5">
          {[...byDate.entries()].map(([date, list]) => {
            const dayNet = list.reduce((s, t) => s + (t.type === "income" ? t.amountPaise : t.type === "expense" ? -t.amountPaise : 0), 0);
            return (
              <section key={date} className="animate-fade-up">
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-fg-muted">
                    {formatDay(date, { short: true })} <span className="ml-1 font-semibold normal-case tracking-normal text-fg-subtle">{relativeDay(date, today)}</span>
                  </h2>
                  {dayNet !== 0 ? <span className={cn("text-xs font-bold tabular-nums", dayNet > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-fg-subtle")}>{dayNet > 0 ? "+" : "−"}{formatINR(Math.abs(dayNet), { whole: true })}</span> : null}
                </div>
                <Card className="divide-y divide-line overflow-hidden">
                  {list.map((t) => (
                    <TxnLine key={t.id} t={t} accounts={accountOptions as AccountOption[]} categories={categories as CategoryOption[]} />
                  ))}
                </Card>
              </section>
            );
          })}
          {rows.length >= 400 ? <p className="text-center text-sm text-fg-subtle">Showing the latest 400 — narrow the dates to see older ones.</p> : null}
        </div>
      )}
    </>
  );
}

function TotalChip({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="glass rounded-2xl border border-line px-4 py-3 shadow-card">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={cn("mt-0.5 truncate text-lg font-extrabold tabular-nums", className)}>{value}</div>
    </div>
  );
}

function TxnLine({ t, accounts, categories }: { t: TxnRow; accounts: AccountOption[]; categories: CategoryOption[] }) {
  const Icon = t.type === "income" ? ArrowDownLeft : t.type === "expense" ? ArrowUpRight : ArrowLeftRight;
  const iconCls =
    t.type === "income" ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" : t.type === "expense" ? "bg-rose-500/10 text-rose-600 dark:text-rose-300" : "bg-brand-soft text-brand";
  const title = t.party || t.description || t.categoryName || (t.type === "transfer" ? "Transfer" : "Entry");
  const sub = t.party && t.description ? t.description : null;
  return (
    <div className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-brand-soft/50">
      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconCls)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold text-fg">{title}</div>
            {sub ? <div className="truncate text-xs text-fg-muted">{sub}</div> : null}
          </div>
          <div className={cn("shrink-0 text-right font-extrabold tabular-nums", t.type === "income" ? "text-emerald-600 dark:text-emerald-400" : t.type === "expense" ? "text-fg" : "text-fg-muted")}>
            {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}
            {formatINR(t.amountPaise)}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          {t.type === "transfer" ? (
            <span>{t.accountName} → {t.toAccountName}</span>
          ) : (
            <>
              <span>{t.accountName}</span>
              {t.categoryName ? <Badge tone="neutral" className="px-2 py-0 text-[11px]">{t.categoryName}</Badge> : <Badge tone="warn" className="px-2 py-0 text-[11px]">Uncategorised</Badge>}
            </>
          )}
          <WorkspaceBadge ws={t.workspace} />
          {t.gstPaise ? <span className="tabular-nums">GST {formatINR(t.gstPaise)}</span> : null}
          {t.tdsPaise ? <span className="tabular-nums">TDS {formatINR(t.tdsPaise)}</span> : null}
          {t.invoiceId ? (
            <Link href={`/invoices/${t.invoiceId}`} className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 font-semibold text-fuchsia-700 hover:bg-fuchsia-500/20 dark:text-fuchsia-300">
              <FileText className="h-3 w-3" /> {t.invoiceNumber ?? "Invoice"}
            </Link>
          ) : null}
          {t.billId ? (
            <Link href={`/planner/bills/${t.billId}`} className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 font-semibold text-sky-700 hover:bg-sky-500/20 dark:text-sky-300">
              <Receipt className="h-3 w-3" /> {t.billTitle ?? "Bill"}
            </Link>
          ) : null}
          {t.payoutId && t.payoutLoanFileId ? (
            <Link href={`/dsa/files/${t.payoutLoanFileId}`} className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-500/20 dark:text-amber-300">
              <Landmark className="h-3 w-3" /> DSA payout
            </Link>
          ) : null}
          {t.importHash ? <span className="text-fg-subtle">Imported</span> : null}
          <span className="ml-auto flex items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <TransactionDialog
              trigger={<Pencil className="h-3.5 w-3.5" />}
              variant="ghost"
              size="icon"
              triggerClassName="h-7 w-7"
              accounts={accounts}
              categories={categories}
              description={t.invoiceId || t.payoutId ? "Linked entry — amount, type and account are managed at the source." : undefined}
              defaults={{
                id: t.id,
                type: t.type,
                date: t.date,
                workspace: t.workspace,
                accountId: t.accountId,
                transferAccountId: t.transferAccountId,
                amountPaise: t.amountPaise,
                categoryId: t.categoryId,
                party: t.party,
                description: t.description,
                gstPaise: t.gstPaise,
                tdsPaise: t.tdsPaise,
                reference: t.reference,
              }}
            />
            {!t.invoiceId && !t.payoutId ? (
              <ActionButton action={deleteTransaction} hidden={{ id: t.id }} variant="ghost" size="icon" className="h-7 w-7" confirm="Delete this entry? Balances will update." title="Delete entry">
                <Trash2 className="h-3.5 w-3.5" />
              </ActionButton>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
