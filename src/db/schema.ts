/**
 * Database schema for the whole app.
 *
 * Conventions:
 * - Money is stored as integer paise (bigint, mode "number"). Use src/lib/money.ts to convert.
 * - Percentages that drive money (GST, payout, TDS, sub-connector share) are stored in basis points
 *   (1% = 100 bps) as integers, so calculations never use floating point rates.
 * - Calendar dates are `date` columns read as "YYYY-MM-DD" strings (IST calendar days).
 * - Instants are `timestamptz` read as JS Date.
 * - Every business record carries a workspace (personal | mahisys | dsa).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const paise = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const day = (name: string) => date(name, { mode: "string" });

export type Recurrence = {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  /** 0 = Sunday … 6 = Saturday, only for weekly */
  byWeekday?: number[];
  /** Optional last date (YYYY-MM-DD) after which no more instances are created */
  until?: string | null;
};

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export const WORKSPACE_KEYS = ["personal", "mahisys", "dsa"] as const;
export type WorkspaceKey = (typeof WORKSPACE_KEYS)[number];

export const workspaces = pgTable("workspaces", {
  key: text("key").$type<WorkspaceKey>().primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  sort: integer("sort").notNull().default(0),
});

/** Key/value settings. See src/server/settings.ts for the typed shape and defaults. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storagePath: text("storage_path").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_entity_idx").on(t.entityType, t.entityId)],
);

/** Append-only history shown on every record. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    details: jsonb("details"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("activity_log_entity_idx").on(t.entityType, t.entityId, t.at)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    kind: text("kind").notNull(), // e.g. "bill_due", "lead_followup", "digest"
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    workspace: text("workspace").$type<WorkspaceKey>(),
    /** Prevents the same alert being raised twice (e.g. "bill_due:<id>:2026-10-14") */
    dedupeKey: text("dedupe_key"),
    readAt: ts("read_at"),
    pushedAt: ts("pushed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey),
    index("notifications_created_idx").on(t.createdAt),
  ],
);

export const pushTokens = pgTable("push_tokens", {
  token: text("token").primaryKey(),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  lastUsedAt: ts("last_used_at"),
});

// ---------------------------------------------------------------------------
// Tasks, projects, time
// ---------------------------------------------------------------------------

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "done", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projects = pgTable("projects", {
  id: id(),
  workspace: text("workspace").$type<WorkspaceKey>().notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  status: text("status").$type<ProjectStatus>().notNull().default("active"),
  startDate: day("start_date"),
  deadline: day("deadline"),
  budgetHours: numeric("budget_hours", { precision: 8, scale: 2, mode: "number" }),
  valuePaise: paise("value_paise"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const milestones = pgTable("milestones", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dueDate: day("due_date"),
  doneAt: ts("done_at"),
  sort: integer("sort").notNull().default(0),
});

export const TASK_STATUSES = ["todo", "doing", "waiting", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Records a task can be linked to. */
export const LINKED_ENTITY_TYPES = ["lead", "invoice", "loan_file", "bill", "contact", "company"] as const;
export type LinkedEntityType = (typeof LINKED_ENTITY_TYPES)[number];

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    workspace: text("workspace").$type<WorkspaceKey>().notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    parentTaskId: uuid("parent_task_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<TaskStatus>().notNull().default("todo"),
    /** 1 (highest) … 4 (lowest) */
    priority: integer("priority").notNull().default(3),
    /** Free-text type used for estimate-accuracy stats, e.g. "development", "sales call", "chore" */
    taskType: text("task_type"),
    dueDate: day("due_date"),
    /** Optional "HH:MM" (IST) when the task is due at a specific time */
    dueTime: text("due_time"),
    remindAt: ts("remind_at"),
    estimateMinutes: integer("estimate_minutes"),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    /** Set on instances generated from a recurring task, pointing at the first task of the series */
    seriesId: uuid("series_id"),
    linkedType: text("linked_type").$type<LinkedEntityType>(),
    linkedId: uuid("linked_id"),
    sort: integer("sort").notNull().default(0),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_due_idx").on(t.status, t.dueDate),
    index("tasks_project_idx").on(t.projectId),
    index("tasks_linked_idx").on(t.linkedType, t.linkedId),
  ],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    startedAt: ts("started_at").notNull(),
    /** Null while the timer is running */
    endedAt: ts("ended_at"),
    minutes: integer("minutes").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("time_entries_task_idx").on(t.taskId)],
);

// ---------------------------------------------------------------------------
// CRM and sales
// ---------------------------------------------------------------------------

export const companies = pgTable("companies", {
  id: id(),
  workspace: text("workspace").$type<WorkspaceKey>().notNull(),
  name: text("name").notNull(),
  gstin: text("gstin"),
  /** Two-digit GST state code, e.g. "27" for Maharashtra */
  stateCode: text("state_code"),
  industry: text("industry"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  address: text("address").notNull().default(""),
  city: text("city"),
  notes: text("notes").notNull().default(""),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contacts = pgTable("contacts", {
  id: id(),
  workspace: text("workspace").$type<WorkspaceKey>().notNull(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  role: text("role"),
  city: text("city"),
  source: text("source"),
  notes: text("notes").notNull().default(""),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const STAGE_KINDS = ["open", "won", "lost"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const leadStages = pgTable("lead_stages", {
  id: id(),
  workspace: text("workspace").$type<WorkspaceKey>().notNull(),
  name: text("name").notNull(),
  kind: text("kind").$type<StageKind>().notNull().default("open"),
  /** Default win probability for leads entering this stage, 0–100 */
  probability: integer("probability").notNull().default(10),
  sort: integer("sort").notNull().default(0),
});

export const leads = pgTable(
  "leads",
  {
    id: id(),
    workspace: text("workspace").$type<WorkspaceKey>().notNull(),
    title: text("title").notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => leadStages.id),
    valuePaise: paise("value_paise").notNull().default(0),
    probability: integer("probability").notNull().default(10),
    expectedCloseDate: day("expected_close_date"),
    source: text("source"),
    nextFollowUpAt: ts("next_follow_up_at"),
    lastActivityAt: ts("last_activity_at"),
    lostReason: text("lost_reason"),
    closedAt: ts("closed_at"),
    notes: text("notes").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("leads_followup_idx").on(t.nextFollowUpAt), index("leads_stage_idx").on(t.stageId)],
);

export const ACTIVITY_TYPES = ["call", "meeting", "email", "whatsapp", "visit", "note"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** CRM interactions: calls, meetings, messages. Used by both the MahiSys CRM and the DSA desk. */
export const activities = pgTable(
  "activities",
  {
    id: id(),
    workspace: text("workspace").$type<WorkspaceKey>().notNull(),
    type: text("type").$type<ActivityType>().notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull().default(""),
    outcome: text("outcome"),
    nextStep: text("next_step"),
    at: ts("at").notNull().defaultNow(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    borrowerId: uuid("borrower_id").references(() => borrowers.id, { onDelete: "cascade" }),
    loanFileId: uuid("loan_file_id").references(() => loanFiles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("activities_lead_idx").on(t.leadId),
    index("activities_loan_file_idx").on(t.loanFileId),
    index("activities_at_idx").on(t.at),
  ],
);

export const salesTargets = pgTable(
  "sales_targets",
  {
    id: id(),
    workspace: text("workspace").$type<WorkspaceKey>().notNull(),
    /** "YYYY-MM" */
    month: text("month").notNull(),
    targetPaise: paise("target_paise").notNull(),
  },
  (t) => [uniqueIndex("sales_targets_month_idx").on(t.workspace, t.month)],
);

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const quotes = pgTable("quotes", {
  id: id(),
  workspace: text("workspace").$type<WorkspaceKey>().notNull(),
  number: text("number").notNull().unique(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  issueDate: day("issue_date").notNull(),
  validUntil: day("valid_until"),
  status: text("status").$type<QuoteStatus>().notNull().default("draft"),
  placeOfSupply: text("place_of_supply"),
  subtotalPaise: paise("subtotal_paise").notNull().default(0),
  taxPaise: paise("tax_paise").notNull().default(0),
  totalPaise: paise("total_paise").notNull().default(0),
  notes: text("notes").notNull().default(""),
  terms: text("terms").notNull().default(""),
  invoiceId: uuid("invoice_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const INVOICE_STATUSES = ["draft", "sent", "part_paid", "paid", "cancelled"] as const;
/** "overdue" is never stored: it is derived from dueDate and balance (see src/lib/invoice-status.ts). */
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    workspace: text("workspace").$type<WorkspaceKey>().notNull(),
    number: text("number").notNull().unique(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id"),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** Snapshot of the bill-to details at the time of invoicing */
    billTo: jsonb("bill_to")
      .$type<{ name: string; gstin?: string | null; address?: string; stateCode?: string | null; email?: string | null }>()
      .notNull(),
    issueDate: day("issue_date").notNull(),
    dueDate: day("due_date").notNull(),
    status: text("status").$type<InvoiceStatus>().notNull().default("draft"),
    placeOfSupply: text("place_of_supply"),
    interstate: boolean("interstate").notNull().default(false),
    subtotalPaise: paise("subtotal_paise").notNull().default(0),
    cgstPaise: paise("cgst_paise").notNull().default(0),
    sgstPaise: paise("sgst_paise").notNull().default(0),
    igstPaise: paise("igst_paise").notNull().default(0),
    totalPaise: paise("total_paise").notNull().default(0),
    /** Sum of payments + TDS credited so far */
    paidPaise: paise("paid_paise").notNull().default(0),
    notes: text("notes").notNull().default(""),
    terms: text("terms").notNull().default(""),
    sentAt: ts("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("invoices_due_idx").on(t.status, t.dueDate)],
);

/** Line items for both quotes and invoices. */
export const lineItems = pgTable(
  "line_items",
  {
    id: id(),
    docType: text("doc_type").$type<"quote" | "invoice">().notNull(),
    docId: uuid("doc_id").notNull(),
    description: text("description").notNull(),
    hsnSac: text("hsn_sac"),
    quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" }).notNull().default(1),
    unitPricePaise: paise("unit_price_paise").notNull(),
    /** GST rate in basis points, e.g. 1800 = 18% */
    gstRateBps: integer("gst_rate_bps").notNull().default(1800),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("line_items_doc_idx").on(t.docType, t.docId)],
);

export const invoicePayments = pgTable("invoice_payments", {
  id: id(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  date: day("date").notNull(),
  amountPaise: paise("amount_paise").notNull(),
  tdsPaise: paise("tds_paise").notNull().default(0),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  transactionId: uuid("transaction_id"),
  mode: text("mode"),
  reference: text("reference"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = ["bank", "cash", "upi", "wallet", "credit_card", "loan"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const accounts = pgTable("accounts", {
  id: id(),
  /** Null = shared across workspaces */
  workspace: text("workspace").$type<WorkspaceKey>(),
  name: text("name").notNull(),
  type: text("type").$type<AccountType>().notNull(),
  institution: text("institution"),
  last4: text("last4"),
  openingBalancePaise: paise("opening_balance_paise").notNull().default(0),
  openingDate: day("opening_date").notNull(),
  creditLimitPaise: paise("credit_limit_paise"),
  archived: boolean("archived").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const categories = pgTable("categories", {
  id: id(),
  /** Null = available in every workspace */
  workspace: text("workspace").$type<WorkspaceKey>(),
  name: text("name").notNull(),
  kind: text("kind").$type<"income" | "expense">().notNull(),
  monthlyBudgetPaise: paise("monthly_budget_paise"),
  /** Lower-case keywords used to auto-categorise imported bank lines */
  matchKeywords: text("match_keywords").array().notNull().default(sql`'{}'::text[]`),
  archived: boolean("archived").notNull().default(false),
});

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Every rupee in or out. amountPaise is always positive; `type` gives the direction.
 * A transfer moves money from accountId to transferAccountId and is not income or expense.
 * For credit cards and loans, an expense increases what you owe (balance goes more negative).
 */
export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    workspace: text("workspace").$type<WorkspaceKey>().notNull(),
    type: text("type").$type<TransactionType>().notNull(),
    date: day("date").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    transferAccountId: uuid("transfer_account_id").references(() => accounts.id),
    amountPaise: paise("amount_paise").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    party: text("party"),
    description: text("description").notNull().default(""),
    gstPaise: paise("gst_paise").notNull().default(0),
    tdsPaise: paise("tds_paise").notNull().default(0),
    reference: text("reference"),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    billId: uuid("bill_id"),
    payoutId: uuid("payout_id"),
    /** Hash of an imported bank line, so re-importing a statement never duplicates entries */
    importHash: text("import_hash"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_account_idx").on(t.accountId),
    uniqueIndex("transactions_import_hash_idx").on(t.importHash),
  ],
);

// ---------------------------------------------------------------------------
// Planner: bills, EMIs, upcoming expenses, renewals
// ---------------------------------------------------------------------------

export const BILL_KINDS = [
  "bill",
  "emi",
  "credit_card",
  "rent",
  "subscription",
  "insurance",
  "utility",
  "tax",
  "salary",
  "vendor",
  "fees",
  "other",
] as const;
export type BillKind = (typeof BILL_KINDS)[number];

export const BILL_PRIORITIES = ["must", "important", "can_wait"] as const;
export type BillPriority = (typeof BILL_PRIORITIES)[number];

export const BILL_STATUSES = ["upcoming", "paid", "skipped"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

/** One payment due. Recurring bills create their next instance when paid or skipped. */
export const bills = pgTable(
  "bills",
  {
    id: id(),
    workspace: text("workspace").$type<WorkspaceKey>().notNull(),
    title: text("title").notNull(),
    payee: text("payee"),
    kind: text("kind").$type<BillKind>().notNull().default("bill"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    amountPaise: paise("amount_paise").notNull(),
    dueDate: day("due_date").notNull(),
    priority: text("priority").$type<BillPriority>().notNull().default("important"),
    canMove: boolean("can_move").notNull().default(false),
    /** The latest date this payment can safely be pushed to */
    latestDate: day("latest_date"),
    status: text("status").$type<BillStatus>().notNull().default("upcoming"),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    seriesId: uuid("series_id"),
    remindDaysBefore: integer("remind_days_before").array().notNull().default(sql`'{3,1}'::integer[]`),
    paidDate: day("paid_date"),
    paidTransactionId: uuid("paid_transaction_id"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("bills_due_idx").on(t.status, t.dueDate)],
);

/** Documents and policies with an expiry date (passport, vehicle insurance, PUC, licences). */
export const renewals = pgTable("renewals", {
  id: id(),
  workspace: text("workspace").$type<WorkspaceKey>().notNull(),
  name: text("name").notNull(),
  kind: text("kind"),
  number: text("number"),
  expiresOn: day("expires_on").notNull(),
  remindDaysBefore: integer("remind_days_before").notNull().default(30),
  notes: text("notes").notNull().default(""),
  renewedAt: ts("renewed_at"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Loan DSA / connector desk (workspace "dsa")
// ---------------------------------------------------------------------------

export const LOAN_PRODUCTS = [
  "home_loan",
  "lap",
  "personal_loan",
  "business_loan",
  "car_loan",
  "education_loan",
  "working_capital",
  "other",
] as const;
export type LoanProduct = (typeof LOAN_PRODUCTS)[number];

export const lenders = pgTable("lenders", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").$type<"bank" | "nbfc" | "hfc" | "other">().notNull().default("bank"),
  dsaCode: text("dsa_code"),
  rmName: text("rm_name"),
  rmPhone: text("rm_phone"),
  rmEmail: text("rm_email"),
  /** Days after disbursal the lender usually pays out */
  payoutDays: integer("payout_days").notNull().default(30),
  notes: text("notes").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Payout grid: commission % by lender, product and ticket size. */
export const payoutRates = pgTable("payout_rates", {
  id: id(),
  lenderId: uuid("lender_id")
    .notNull()
    .references(() => lenders.id, { onDelete: "cascade" }),
  product: text("product").$type<LoanProduct>().notNull(),
  minTicketPaise: paise("min_ticket_paise").notNull().default(0),
  /** Null = no upper limit */
  maxTicketPaise: paise("max_ticket_paise"),
  rateBps: integer("rate_bps").notNull(),
  notes: text("notes").notNull().default(""),
});

export const subConnectors = pgTable("sub_connectors", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  /** Share of your gross payout passed on, in basis points */
  shareBps: integer("share_bps").notNull().default(0),
  notes: text("notes").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const borrowers = pgTable("borrowers", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  city: text("city"),
  employmentType: text("employment_type").$type<"salaried" | "self_employed" | "business" | "other">(),
  monthlyIncomePaise: paise("monthly_income_paise"),
  cibilScore: integer("cibil_score"),
  source: text("source"),
  subConnectorId: uuid("sub_connector_id").references(() => subConnectors.id, { onDelete: "set null" }),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const LOAN_STAGES = [
  "lead",
  "eligibility",
  "documents",
  "logged_in",
  "credit_query",
  "sanctioned",
  "disbursed",
  "payout_invoiced",
  "payout_received",
  "rejected",
  "dropped",
] as const;
export type LoanStage = (typeof LOAN_STAGES)[number];

export const PENDING_WITH = ["customer", "me", "lender", "valuation_legal", "none"] as const;
export type PendingWith = (typeof PENDING_WITH)[number];

export const loanFiles = pgTable(
  "loan_files",
  {
    id: id(),
    borrowerId: uuid("borrower_id")
      .notNull()
      .references(() => borrowers.id, { onDelete: "cascade" }),
    lenderId: uuid("lender_id").references(() => lenders.id, { onDelete: "set null" }),
    product: text("product").$type<LoanProduct>().notNull(),
    amountRequestedPaise: paise("amount_requested_paise").notNull().default(0),
    sanctionedPaise: paise("sanctioned_paise"),
    disbursedPaise: paise("disbursed_paise"),
    stage: text("stage").$type<LoanStage>().notNull().default("lead"),
    stageChangedAt: ts("stage_changed_at").notNull().defaultNow(),
    pendingWith: text("pending_with").$type<PendingWith>().notNull().default("me"),
    pendingNote: text("pending_note").notNull().default(""),
    applicationNo: text("application_no"),
    loginDate: day("login_date"),
    sanctionDate: day("sanction_date"),
    disbursalDate: day("disbursal_date"),
    closeReason: text("close_reason"),
    nextFollowUpAt: ts("next_follow_up_at"),
    /** Payout rate snapshot taken from the grid when the file is disbursed (editable) */
    payoutRateBps: integer("payout_rate_bps"),
    expectedPayoutPaise: paise("expected_payout_paise"),
    subConnectorId: uuid("sub_connector_id").references(() => subConnectors.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("loan_files_stage_idx").on(t.stage, t.stageChangedAt)],
);

export const loanStageHistory = pgTable("loan_stage_history", {
  id: id(),
  loanFileId: uuid("loan_file_id")
    .notNull()
    .references(() => loanFiles.id, { onDelete: "cascade" }),
  fromStage: text("from_stage").$type<LoanStage>(),
  toStage: text("to_stage").$type<LoanStage>().notNull(),
  note: text("note").notNull().default(""),
  at: ts("at").notNull().defaultNow(),
});

export const loanDocuments = pgTable("loan_documents", {
  id: id(),
  loanFileId: uuid("loan_file_id")
    .notNull()
    .references(() => loanFiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").$type<"pending" | "received" | "submitted" | "not_needed">().notNull().default("pending"),
  receivedAt: ts("received_at"),
  sort: integer("sort").notNull().default(0),
});

export const PAYOUT_STATUSES = ["expected", "invoiced", "received"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const payouts = pgTable("payouts", {
  id: id(),
  loanFileId: uuid("loan_file_id")
    .notNull()
    .references(() => loanFiles.id, { onDelete: "cascade" }),
  lenderId: uuid("lender_id").references(() => lenders.id, { onDelete: "set null" }),
  status: text("status").$type<PayoutStatus>().notNull().default("expected"),
  expectedDate: day("expected_date"),
  grossPaise: paise("gross_paise").notNull(),
  gstPaise: paise("gst_paise").notNull().default(0),
  tdsPaise: paise("tds_paise").notNull().default(0),
  netReceivedPaise: paise("net_received_paise"),
  invoiceNo: text("invoice_no"),
  invoiceDate: day("invoice_date"),
  receivedDate: day("received_date"),
  transactionId: uuid("transaction_id"),
  subConnectorId: uuid("sub_connector_id").references(() => subConnectors.id, { onDelete: "set null" }),
  subConnectorSharePaise: paise("sub_connector_share_paise").notNull().default(0),
  subConnectorPaidDate: day("sub_connector_paid_date"),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

export const automationRules = pgTable("automation_rules", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  lastRunAt: ts("last_run_at"),
  lastResult: text("last_result"),
});

export const automationRuns = pgTable("automation_runs", {
  id: id(),
  trigger: text("trigger").notNull(),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  ok: boolean("ok"),
  results: jsonb("results"),
});
