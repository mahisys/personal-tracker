import Link from "next/link";
import { Archive, ArchiveRestore, ArrowDownLeft, ArrowUpRight, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { getCategoryTotals, listCategories, type CategoryRow } from "@/server/books/queries";
import { deleteCategory, toggleArchiveCategory } from "@/server/books/actions";
import { budgetState, monthRange } from "@/server/books/calc";
import { formatMonth, monthKey, todayIST } from "@/lib/dates";
import { formatINRShort } from "@/lib/money";
import { cn } from "@/lib/cn";
import { PageHeader, EmptyState, Section } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/stat";
import { ActionButton } from "@/components/client/action-form";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { BooksNav } from "@/components/books/meta";
import { CategoryDialog } from "@/components/books/category-dialog";

export default async function CategoriesPage() {
  await requireUser();
  const ws = await getWorkspaceFilter();
  const month = monthKey(todayIST());
  const { from, to } = monthRange(month);
  const [all, spend, earned] = await Promise.all([listCategories({ includeArchived: true }), getCategoryTotals(ws, from, to, "expense"), getCategoryTotals(ws, from, to, "income")]);
  const totals = new Map([...spend, ...earned].map((s) => [s.categoryId, s.totalPaise]));
  const visible = all.filter((c) => !ws || c.workspace == null || c.workspace === ws);
  const active = visible.filter((c) => !c.archived);
  const archived = visible.filter((c) => c.archived);

  return (
    <>
      <PageHeader
        eyebrow="Books"
        title="Categories"
        description="Budgets and auto-match keywords keep your books tidy without effort."
        actions={<CategoryDialog trigger={<><Plus className="h-4 w-4" /> New category</>} defaults={{ workspace: ws }} />}
      />
      <BooksNav active="/books/categories" />
      {active.length === 0 ? (
        <EmptyState icon={<Tags className="h-6 w-6" />} title="No categories yet" description="Create one for each kind of spending or income you want to see separately." />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {(["expense", "income"] as const).map((kind) => (
            <Section
              key={kind}
              title={
                <span className="inline-flex items-center gap-1.5">
                  {kind === "expense" ? <ArrowUpRight className="h-4 w-4 text-rose-500" /> : <ArrowDownLeft className="h-4 w-4 text-emerald-500" />}
                  {kind === "expense" ? "Expenses" : "Income"} · {formatMonth(month)}
                </span>
              }
            >
              <Card className="stagger divide-y divide-line overflow-hidden">
                {active
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <CategoryLine key={c.id} c={c} total={totals.get(c.id) ?? 0} from={from} to={to} />
                  ))}
              </Card>
            </Section>
          ))}
        </div>
      )}
      {archived.length ? (
        <Section title="Archived">
          <div className="flex flex-wrap gap-2">
            {archived.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm text-fg-muted">
                {c.name}
                <ActionButton action={toggleArchiveCategory} hidden={{ id: c.id }} variant="ghost" size="icon" className="h-7 w-7" title="Restore">
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </ActionButton>
              </span>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function CategoryLine({ c, total, from, to }: { c: CategoryRow; total: number; from: string; to: string }) {
  const b = c.monthlyBudgetPaise ? budgetState(total, c.monthlyBudgetPaise) : null;
  return (
    <div className="group px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/books/transactions?categoryId=${c.id}&from=${from}&to=${to}`} className="truncate font-semibold text-fg hover:text-brand">{c.name}</Link>
            {c.workspace ? <WorkspaceBadge ws={c.workspace} /> : null}
          </div>
          {c.matchKeywords.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {c.matchKeywords.slice(0, 6).map((k) => (
                <span key={k} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">{k}</span>
              ))}
              {c.matchKeywords.length > 6 ? <span className="text-[10px] text-fg-subtle">+{c.matchKeywords.length - 6}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="text-right">
          <div className="font-bold tabular-nums text-fg">{formatINRShort(total)}</div>
          {c.monthlyBudgetPaise ? <div className="text-[11px] text-fg-subtle">of {formatINRShort(c.monthlyBudgetPaise)}</div> : null}
        </div>
        <div className="flex items-center sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <CategoryDialog trigger={<Pencil className="h-3.5 w-3.5" />} variant="ghost" size="icon" triggerClassName="h-8 w-8" defaults={{ ...c }} />
          <ActionButton action={toggleArchiveCategory} hidden={{ id: c.id }} variant="ghost" size="icon" className="h-8 w-8" title="Archive">
            <Archive className="h-3.5 w-3.5" />
          </ActionButton>
          <ActionButton action={deleteCategory} hidden={{ id: c.id }} variant="ghost" size="icon" className="h-8 w-8" confirm={`Delete “${c.name}”? Its entries become uncategorised.`} title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </ActionButton>
        </div>
      </div>
      {b ? (
        <div className="mt-2">
          <Progress value={b.pct} tone={b.tone} className="h-1.5" />
          <div className={cn("mt-1 text-[11px] font-medium", b.tone === "bad" ? "text-rose-600 dark:text-rose-400" : b.tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-fg-subtle")}>
            {b.leftPaise >= 0 ? `${formatINRShort(b.leftPaise)} left this month` : `${formatINRShort(-b.leftPaise)} over budget`}
          </div>
        </div>
      ) : null}
    </div>
  );
}
