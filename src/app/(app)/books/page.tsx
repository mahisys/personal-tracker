import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CreditCard, HandCoins, PiggyBank, Plus, Sparkles, Target, Upload, Wallet } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { liquidBalance } from "@/server/ledger";
import { getAccountsWithBalances, getCategoryTotals, getMonthlyTotals, getTotals, listAccountOptions, listCategories } from "@/server/books/queries";
import { budgetState, monthRange } from "@/server/books/calc";
import { addMonths, formatMonth, monthKey, todayIST } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";
import { cn } from "@/lib/cn";
import { PageHeader, EmptyState, Section } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Progress, StatTile } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/client/animated-number";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { ACCOUNT_STYLE, AccountIcon, BooksNav, accountTypeLabel } from "@/components/books/meta";
import { TransactionDialog } from "@/components/books/transaction-dialog";
import { CATEGORY_COLORS, CategoryDonut, IncomeExpenseChart, OTHER_COLOR } from "@/components/books/charts";
import { CelebrateOnce } from "@/components/books/budget-celebration";

export default async function BooksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const newType = sp.new === "income" ? "income" : sp.new === "expense" ? "expense" : sp.new === "transfer" ? "transfer" : null;
  const ws = await getWorkspaceFilter();
  const today = todayIST();
  const month = monthKey(today);
  const { from, to } = monthRange(month);
  const prevMonth = monthKey(addMonths(`${month}-01`, -1));
  const prev = monthRange(prevMonth);

  const [accts, totals, monthly, spend, prevSpend, categories, accountOptions] = await Promise.all([
    getAccountsWithBalances(ws),
    getTotals(ws, from, to),
    getMonthlyTotals(ws, today, 6),
    getCategoryTotals(ws, from, to, "expense"),
    getCategoryTotals(ws, prev.from, prev.to, "expense"),
    listCategories(),
    listAccountOptions(),
  ]);

  const liquid = liquidBalance(accts);
  const cardDues = accts.filter((a) => a.type === "credit_card").reduce((s, a) => s + Math.max(0, -a.balancePaise), 0);
  const loans = accts.filter((a) => a.type === "loan").reduce((s, a) => s + Math.max(0, -a.balancePaise), 0);

  const top = spend.slice(0, 5);
  const rest = spend.slice(5).reduce((s, c) => s + c.totalPaise, 0);
  const donut = [
    ...top.map((c, i) => ({ name: c.name, totalPaise: c.totalPaise, color: CATEGORY_COLORS[i] })),
    ...(rest > 0 ? [{ name: "Other", totalPaise: rest, color: OTHER_COLOR }] : []),
  ];

  const budgeted = categories.filter((c) => c.kind === "expense" && c.monthlyBudgetPaise && (!ws || c.workspace == null || c.workspace === ws));
  const spendById = new Map(spend.map((s) => [s.categoryId, s.totalPaise]));
  const prevById = new Map(prevSpend.map((s) => [s.categoryId, s.totalPaise]));
  const budgets = budgeted
    .map((c) => ({ ...c, spent: spendById.get(c.id) ?? 0, state: budgetState(spendById.get(c.id) ?? 0, c.monthlyBudgetPaise!) }))
    .sort((a, b) => b.state.pct - a.state.pct);
  const lastMonthWins = budgeted.length > 0 && budgeted.every((c) => (prevById.get(c.id) ?? 0) <= c.monthlyBudgetPaise!) && prevSpend.length > 0;

  const txnDefaults = { workspace: ws ?? "personal" } as const;

  return (
    <>
      <PageHeader
        eyebrow="Money"
        title="Books"
        description="Every rupee in and out, across your accounts — at a glance."
        actions={
          <>
            <TransactionDialog
              key={`income-${newType}`}
              trigger={<><ArrowDownLeft className="h-4 w-4" /> Income</>}
              title="Money in"
              variant="secondary"
              accounts={accountOptions}
              categories={categories}
              defaults={{ ...txnDefaults, type: "income" }}
              defaultOpen={newType === "income"}
            />
            <TransactionDialog
              key={`expense-${newType}`}
              trigger={<><Plus className="h-4 w-4" /> Expense</>}
              title="Money out"
              accounts={accountOptions}
              categories={categories}
              defaults={{ ...txnDefaults, type: newType === "transfer" ? "transfer" : "expense" }}
              defaultOpen={newType === "expense" || newType === "transfer"}
            />
          </>
        }
      />
      <BooksNav active="/books" />

      {lastMonthWins ? (
        <Card className="mb-6 flex items-center gap-4 border-emerald-500/30 bg-emerald-500/5 p-4 animate-pop-in">
          <CelebrateOnce storageKey={`budget-win-${prevMonth}`} />
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="text-sm">
            <div className="font-bold text-fg">You stayed within every budget in {formatMonth(prevMonth)} 🎉</div>
            <div className="text-fg-muted">That&apos;s how calm money feels. Keep it going this month.</div>
          </div>
        </Card>
      ) : null}

      <div className="stagger mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Cash you can use" value={<AnimatedNumber value={liquid} format="inr" />} sub="Bank, cash, UPI & wallets" icon={<Wallet className="h-5 w-5" />} tone="brand" className="col-span-2 lg:col-span-1" />
        <StatTile label={`Net · ${formatMonth(month)}`} value={<span className={totals.netPaise >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{totals.netPaise >= 0 ? "+" : "−"}{formatINRShort(Math.abs(totals.netPaise))}</span>} sub={<><span className="text-emerald-600 dark:text-emerald-400">{formatINRShort(totals.incomePaise)} in</span> · <span className="text-rose-600 dark:text-rose-400">{formatINRShort(totals.expensePaise)} out</span></>} icon={<PiggyBank className="h-5 w-5" />} tone={totals.netPaise >= 0 ? "good" : "bad"} href="/books/transactions" />
        <StatTile label="Card dues" value={formatINRShort(cardDues)} sub={cardDues ? "Owed on credit cards" : "Nothing owed — lovely"} icon={<CreditCard className="h-5 w-5" />} tone={cardDues ? "warn" : "good"} href="/books/accounts" />
        <StatTile label="Loans outstanding" value={formatINRShort(loans)} sub={loans ? "Principal still to repay" : "Debt-free"} icon={<HandCoins className="h-5 w-5" />} tone={loans ? "neutral" : "good"} href="/books/accounts" />
      </div>

      <Section title="Accounts" actions={<Link href="/books/accounts" className="text-sm font-semibold text-brand hover:underline">Manage</Link>}>
        {accts.length === 0 ? (
          <EmptyState icon={<Wallet className="h-6 w-6" />} title="No accounts yet" description="Add your bank, cash, UPI or credit card to start tracking balances." action={<LinkButton href="/books/accounts?new=1">Add an account</LinkButton>} />
        ) : (
          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accts.map((a) => {
              const debt = a.type === "credit_card" || a.type === "loan";
              const owed = Math.max(0, -a.balancePaise);
              const used = debt && a.creditLimitPaise ? Math.round((owed / a.creditLimitPaise) * 100) : null;
              return (
                <Link key={a.id} href={`/books/accounts/${a.id}`} className="glass group relative overflow-hidden rounded-[var(--radius-card)] border border-line p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-pop">
                  <div className={cn("pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-2xl", ACCOUNT_STYLE[a.type].glow)} />
                  <div className="relative flex items-center gap-3">
                    <AccountIcon type={a.type} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-fg">{a.name}{a.last4 ? <span className="ml-1 text-fg-subtle">••{a.last4}</span> : null}</div>
                      <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                        {accountTypeLabel(a.type)}
                        {a.institution ? <> · {a.institution}</> : null}
                        {a.workspace ? <WorkspaceBadge ws={a.workspace} className="ml-1" /> : null}
                      </div>
                    </div>
                  </div>
                  <div className="relative mt-4 flex items-end justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{debt ? (owed ? "You owe" : "Balance") : "Balance"}</div>
                      <div className={cn("text-xl font-extrabold tabular-nums", debt && owed ? "text-rose-600 dark:text-rose-400" : a.balancePaise < 0 ? "text-rose-600 dark:text-rose-400" : "text-fg")}>
                        {formatINR(debt ? owed || a.balancePaise : a.balancePaise, { whole: true })}
                      </div>
                    </div>
                    {used != null ? <Badge tone={used >= 80 ? "bad" : used >= 50 ? "warn" : "good"}>{used}% of limit</Badge> : null}
                  </div>
                  {used != null ? <Progress className="relative mt-3 h-1.5" value={used} tone={used >= 80 ? "bad" : used >= 50 ? "warn" : "good"} /> : null}
                </Link>
              );
            })}
          </div>
        )}
      </Section>

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3 animate-fade-up">
          <CardHeader
            title="Last 6 months"
            description="Income vs expense"
            actions={
              <div className="flex items-center gap-3 text-xs font-semibold text-fg-muted">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Income</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />Expense</span>
              </div>
            }
          />
          <CardBody>
            <IncomeExpenseChart data={monthly} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2 animate-fade-up">
          <CardHeader title="Where it went" description={`Top expenses · ${formatMonth(month)}`} />
          <CardBody>
            {donut.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <ArrowUpRight className="mb-2 h-6 w-6 text-fg-subtle" />
                <p className="text-sm text-fg-muted">No spending recorded this month yet.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
                <CategoryDonut data={donut} totalPaise={totals.expensePaise} />
                <ul className="w-full min-w-0 space-y-2">
                  {donut.map((d) => (
                    <li key={d.name} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                      <span className="min-w-0 flex-1 truncate text-fg">{d.name}</span>
                      <span className="font-semibold tabular-nums text-fg">{formatINRShort(d.totalPaise)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Section title={`Budgets · ${formatMonth(month)}`} actions={<Link href="/books/categories" className="text-sm font-semibold text-brand hover:underline">Set budgets</Link>}>
        {budgets.length === 0 ? (
          <EmptyState icon={<Target className="h-6 w-6" />} title="No budgets yet" description="Give a category a monthly budget and we'll show how you're tracking — gently." action={<LinkButton href="/books/categories" variant="soft">Add a budget</LinkButton>} />
        ) : (
          <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
            {budgets.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Link href={`/books/transactions?categoryId=${b.id}&from=${from}&to=${to}`} className="truncate font-semibold text-fg hover:text-brand">{b.name}</Link>
                  <span className="text-sm tabular-nums text-fg-muted">
                    <span className="font-bold text-fg">{formatINRShort(b.spent)}</span> / {formatINRShort(b.monthlyBudgetPaise)}
                  </span>
                </div>
                <Progress value={b.state.pct} tone={b.state.tone} />
                <div className={cn("mt-1.5 text-xs font-medium", b.state.tone === "bad" ? "text-rose-600 dark:text-rose-400" : b.state.tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-fg-muted")}>
                  {b.state.leftPaise >= 0 ? `${formatINRShort(b.state.leftPaise)} left · ${b.state.pct}% used` : `${formatINRShort(-b.state.leftPaise)} over budget`}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/books/import" variant="soft" size="sm"><Upload className="h-4 w-4" /> Import a bank statement</LinkButton>
        <LinkButton href="/books?new=transfer" variant="ghost" size="sm">Move money between accounts</LinkButton>
      </div>
    </>
  );
}
