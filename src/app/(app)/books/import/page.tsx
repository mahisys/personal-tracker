import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { listAccountOptions, listCategories } from "@/server/books/queries";
import { PageHeader } from "@/components/ui/page";
import { BooksNav } from "@/components/books/meta";
import { ImportWizard } from "@/components/books/import-wizard";
import type { AccountOption, CategoryOption } from "@/components/books/transaction-dialog";

export default async function ImportPage() {
  await requireUser();
  const ws = await getWorkspaceFilter();
  const [accounts, categories] = await Promise.all([listAccountOptions(), listCategories()]);
  const usable = accounts.filter((a) => a.type !== "loan");
  return (
    <>
      <PageHeader eyebrow="Books" title="Import a statement" description="Drop in a bank or card CSV — we'll sort the lines into categories for you." />
      <BooksNav active="/books/import" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <ImportWizard
            accounts={usable as AccountOption[]}
            categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, workspace: c.workspace })) as CategoryOption[]}
            defaultWorkspace={ws ?? "personal"}
          />
        </div>
        <aside className="space-y-3 text-sm text-fg-muted">
          <div className="flex items-start gap-2 rounded-2xl bg-emerald-500/8 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
            <p>Safe to re-import: lines already in your books are recognised and skipped, so overlapping statements never double count.</p>
          </div>
          <p className="px-1">Categories are suggested from each category&apos;s keywords. Add keywords on the <Link href="/books/categories" className="font-semibold text-brand">Categories</Link> page and future imports get smarter.</p>
        </aside>
      </div>
    </>
  );
}
