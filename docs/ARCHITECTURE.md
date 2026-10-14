# Command Center — architecture and module guide

A private, single-user app for three workspaces: **Personal**, **MahiSys** and **Loan DSA**.
Next.js 16 (App Router, React 19, Server Components + Server Actions), PostgreSQL via Drizzle ORM,
Tailwind CSS v4, `motion` for animation. Hosted only on Google Cloud (Cloud Run + Cloud SQL).

> Next.js 16 differs from older versions (e.g. `middleware.ts` is now `src/proxy.ts`, `params` and
> `searchParams` are Promises). When unsure, read `node_modules/next/dist/docs/`.
> Cache Components are **off**: pages are dynamic and read the database on every request.

## Folder map

| Path | What lives there |
| --- | --- |
| `src/db/schema.ts` | The whole database schema. Money = integer **paise**; rates = **basis points** (1% = 100). |
| `src/db/index.ts` | `db` (Drizzle, postgres-js). `DbOrTx` for functions usable inside `db.transaction`. |
| `src/db/seed.ts` | Idempotent defaults (workspaces, categories, CRM stages, cash account). |
| `src/lib/*` | Pure helpers safe on client and server: `money.ts`, `dates.ts` (IST!), `recurrence.ts`, `gst.ts`, `action.ts`, `cn.ts`, `nav.ts`, `workspaces.ts`. |
| `src/server/*` | Server-only helpers: `auth.ts` (`requireUser`), `settings.ts` (`getSettings`), `workspace.ts` (`getWorkspaceFilter`), `ledger.ts` (`createTransaction`, `getAccountBalances`), `notify.ts` (`createNotification`), `activity.ts` (`logActivity`), `storage.ts`. |
| `src/components/ui/*` | Server-safe design-system primitives. |
| `src/components/client/*` | Client components: `ActionForm`, `SubmitButton`, `ActionButton`, `Modal`, `AnimatedNumber`, `RecurrenceFields`, `celebrate()`. |
| `src/components/shared/*` | `Attachments`, `History`, `WorkspaceBadge`. |
| `src/app/(app)/<module>/` | Pages for each module (all behind login). |
| `src/server/<module>/` | That module's queries, actions and pure logic. |

## Route map (link to these exact paths)

| Module | Routes |
| --- | --- |
| Today | `/` |
| Tasks | `/tasks` (list + board), `/tasks/[id]` |
| Projects | `/projects`, `/projects/[id]` |
| CRM | `/crm` (pipeline), `/crm/leads/[id]`, `/crm/contacts`, `/crm/contacts/[id]`, `/crm/companies`, `/crm/companies/[id]` |
| Sales | `/sales` (dashboard + targets), `/sales/quotes`, `/sales/quotes/[id]` |
| Invoices | `/invoices`, `/invoices/new`, `/invoices/[id]`, `/api/invoices/[id]/pdf` |
| Books | `/books` (overview), `/books/transactions`, `/books/accounts`, `/books/accounts/[id]`, `/books/categories`, `/books/import` |
| Planner | `/planner` (upcoming payments + forecast), `/planner/bills/[id]`, `/planner/renewals` |
| DSA desk | `/dsa` (dashboard + board), `/dsa/files/[id]`, `/dsa/borrowers`, `/dsa/borrowers/[id]`, `/dsa/lenders`, `/dsa/lenders/[id]`, `/dsa/payouts`, `/dsa/partners` |
| Reports | `/reports` (+ sub-pages) |
| Automations | `/automations`, `/api/cron/run` |
| Alerts | `/notifications` |
| Settings | `/settings` |
| Search | `/search?q=` |

Quick-add links open a page's "new" dialog: `/tasks?new=1`, `/crm?new=1`, `/dsa?new=1`,
`/books?new=expense|income`, `/planner?new=1`, `/invoices/new`. Implement by rendering the
`<Modal defaultOpen={…}>` when the search param is present.

## Rules every module follows

1. **Auth:** every page and every server action starts with `await requireUser()`.
2. **Mutations** are Server Actions in `src/server/<module>/actions.ts` (`"use server"`), with the
   signature `(prev: ActionResult, form: FormData) => Promise<ActionResult>` so they work with
   `<ActionForm>` and `<ActionButton>`. Validate input (use `str/int/bool/day` from `@/lib/action`,
   `parseRupeesToPaise`, `percentToBps`), return `fail("human message")` on bad input, call
   `revalidatePath` for affected pages, and return `done("Friendly message")`. Use
   `{ celebrate: true }` for wins (task done, lead won, invoice paid, loan disbursed, payout received).
   Use `db.transaction` when writing more than one table.
3. **Money:** store paise (`bigint` mode number). Display with `formatINR` / `formatINRShort`.
   Never use floats for rates — basis points with `applyBps`.
4. **Dates:** the server runs in UTC, the user in IST. Use `todayIST()`, `istToInstant()`,
   `toDateTimeLocalIST()` / `fromDateTimeLocalIST()` from `@/lib/dates`. Never `new Date().toISOString().slice(0,10)` for "today".
5. **Money into the books:** only via `createTransaction()` in `src/server/ledger.ts`.
6. **History:** call `logActivity(entityType, id, action, summary)` on meaningful changes and show
   `<History>` on detail pages. Show `<Attachments>` on detail pages where documents matter.
7. **Workspace filter:** list pages respect `await getWorkspaceFilter()` (null = all) where the data has a workspace.
8. **Keep pure logic pure and tested:** calculations (ETA, forecast, GST, payouts, pendency, rules)
   live in plain functions with Vitest tests next to them (`*.test.ts`).

## UX bar — the app must feel calm, delightful and positive

- Start every page with `<PageHeader>` (eyebrow, title, one-line description, actions).
- Use `Card`, `StatTile`, `Progress`, `ProgressRing`, `Badge`, `EmptyState`, `TableWrap`/`Table`.
  Wrap repeated items in a container with the `stagger` class so they fade up one after another.
- Create/edit in a `<Modal>` with an `<ActionForm>` inside; footer via `<ModalActions>`.
- Empty states are encouraging, with an icon and a clear first action ("No leads yet — add your first one").
- Microcopy is warm and short: "Nice — invoice sent", "All caught up 🎉" (emoji sparingly, only in celebrations).
- Mobile first: every page works at 375 px wide; tables scroll inside `TableWrap`; kanban boards scroll sideways.
- Colour meaning: brand violet = primary, emerald = good/done/money in, amber = attention/waiting,
  rose = overdue/urgent/money out. Workspace colours: Personal emerald, MahiSys indigo, DSA amber.
- Icons: `lucide-react`. Animations: CSS classes (`animate-fade-up`, `animate-pop-in`, `stagger`) or
  `motion/react` in client components. Respect `prefers-reduced-motion` (globals.css already does).
- Dark mode works automatically if you use the tokens (`bg-solid`, `bg-muted`, `text-fg`, `text-fg-muted`,
  `border-line`, `bg-brand-soft`, `text-brand`, …). Avoid raw `bg-white` / `text-black`.

## Testing

- `npx tsc --noEmit` must pass.
- `npx vitest run <your files>` for unit/DB tests. DB tests: `import { resetDb } from "@/test/db"` and
  call it in `beforeEach`. Server actions can be called directly in tests (`next/cache`, `next/headers`
  and `next/navigation` are mocked in `src/test/setup-mocks.ts`; `AUTH_MODE=dev` bypasses login).
- `npm run build` for a full production build.
