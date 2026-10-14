# Command Center

A private app for running everything in one place: **Personal**, **MahiSys** and the **Loan DSA** business.
Tasks and projects with estimates and ETAs, a CRM and sales pipeline, GST invoicing, books of account,
an upcoming-payments planner with a cash-flow forecast, a DSA desk from borrower lead to payout received,
and automations that tell you each morning what needs you.

Runs only on **Google Cloud** (Cloud Run, Cloud SQL, Cloud Storage, Identity Platform, FCM, Cloud Scheduler).
Works on a laptop and installs on your phone as an app.

- **Deploy:** see [DEPLOY.md](./DEPLOY.md) — one command in Cloud Shell: `bash scripts/deploy.sh`
- **How the code is organised:** see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

## Modules

| Module | What it does |
| --- | --- |
| Today | One prioritised list of everything due: tasks, follow-ups, bills, overdue invoices, DSA files to chase |
| Tasks & projects | Priorities, due dates, recurrence, subtasks, kanban, timers, estimates, ETA, estimate accuracy |
| CRM & sales | Leads pipeline, contacts, companies, activity log, follow-ups, quotes, monthly targets |
| Invoices | GST tax invoices (CGST/SGST/IGST), PDF, payments with TDS, receivables |
| Books | Accounts, income, expenses, transfers, categories, budgets, bank statement CSV import |
| Planner | Bills, EMIs, subscriptions; priority and "can move" dates; 90-day cash-flow forecast; renewals |
| DSA desk | Borrowers, loan files by stage, document checklists, pendency board, lenders and payout grid, payouts, sub-connectors, earnings |
| Automations | Daily digest, reminders, stale lead/file chasers, overdue invoices, payout chase, cash warnings, weekly review |
| Reports | P&L by workspace, expenses by category, receivables ageing, GST summary, budget vs actual, time |

## Tech

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Drizzle ORM · PostgreSQL 16 ·
Tailwind CSS v4 · motion · Recharts · Firebase Auth & Cloud Messaging · Terraform.

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev       # http://localhost:3000
npm test
```
