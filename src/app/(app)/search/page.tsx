import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CheckSquare,
  FileSignature,
  FileText,
  FolderKanban,
  Landmark,
  ArrowLeftRight,
  SearchX,
  Sparkles,
  Target,
  User,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/server/auth";
import { searchAll, type SearchGroupKey } from "@/server/search/search";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { ResultsKeyboard, SearchBox } from "./search-box";

export const metadata = { title: "Search" };

const ICONS: Record<SearchGroupKey, { icon: LucideIcon; tone: string }> = {
  leads: { icon: Target, tone: "text-indigo-600 bg-indigo-500/12 dark:text-indigo-300" },
  contacts: { icon: User, tone: "text-sky-600 bg-sky-500/12 dark:text-sky-300" },
  companies: { icon: Building2, tone: "text-violet-600 bg-violet-500/12 dark:text-violet-300" },
  borrowers: { icon: UserRound, tone: "text-amber-600 bg-amber-500/14 dark:text-amber-300" },
  files: { icon: Landmark, tone: "text-amber-600 bg-amber-500/14 dark:text-amber-300" },
  invoices: { icon: FileText, tone: "text-fuchsia-600 bg-fuchsia-500/12 dark:text-fuchsia-300" },
  quotes: { icon: FileSignature, tone: "text-fuchsia-600 bg-fuchsia-500/12 dark:text-fuchsia-300" },
  tasks: { icon: CheckSquare, tone: "text-brand bg-brand-soft" },
  projects: { icon: FolderKanban, tone: "text-brand bg-brand-soft" },
  transactions: { icon: ArrowLeftRight, tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-300" },
  bills: { icon: CalendarClock, tone: "text-rose-600 bg-rose-500/12 dark:text-rose-300" },
};

const TRY = ["GST", "EMI", "HDFC", "proposal", "rent"];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q = "" } = await searchParams;
  const res = await searchAll(q);

  return (
    <>
      <PageHeader eyebrow="Find anything" title="Search" description="Leads, contacts, borrowers, loan files, invoices, tasks, money — all in one place." />
      <div className="mx-auto max-w-3xl">
        <SearchBox initial={q} />
        <ResultsKeyboard />

        <div className="mt-6">
          {!res ? (
            <div className="animate-fade-up rounded-2xl border border-dashed border-line-strong p-6 text-center">
              <Sparkles className="mx-auto mb-2 h-6 w-6 text-brand" />
              <p className="text-sm text-fg-muted">Type at least two letters. Phone numbers work with or without spaces.</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {TRY.map((t) => (
                  <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand transition hover:bg-brand/15">
                    {t}
                  </Link>
                ))}
              </div>
            </div>
          ) : res.total === 0 ? (
            <EmptyState icon={<SearchX className="h-6 w-6" />} title={`Nothing matches “${res.q}”`} description="Try fewer letters, a phone number, an invoice number or a GSTIN." />
          ) : (
            <div className="space-y-6">
              <p className="text-xs font-semibold text-fg-subtle">
                {res.total} result{res.total === 1 ? "" : "s"} for “{res.q}”
              </p>
              {res.groups.map((g) => {
                const { icon: Icon, tone } = ICONS[g.key];
                return (
                  <section key={g.key} className="animate-fade-up">
                    <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-fg-subtle">
                      {g.label} <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{g.items.length}</span>
                    </h2>
                    <ul className="stagger glass divide-y divide-line overflow-hidden rounded-2xl border border-line shadow-card">
                      {g.items.map((it) => (
                        <li key={it.id}>
                          <Link
                            href={it.href}
                            data-search-result
                            className="group flex items-center gap-3 px-4 py-3 outline-none transition hover:bg-brand-soft/60 focus-visible:bg-brand-soft"
                          >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                              <Icon className="h-4.5 w-4.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-fg">{it.title}</span>
                              <span className="block truncate text-xs text-fg-muted">{it.subtitle}</span>
                            </span>
                            {it.workspace ? <WorkspaceBadge ws={it.workspace} className="hidden sm:inline-flex" /> : null}
                            <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
