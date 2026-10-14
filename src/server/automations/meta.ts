/**
 * Client-safe descriptions of every automation rule: what triggers it, what it does, where it tells you,
 * its default config and the editable config fields shown on /automations.
 * The runnable rules live in ./registry.ts (server-only).
 */

export const RULE_KEYS = [
  "daily_digest",
  "bill_reminders",
  "lead_followups",
  "stale_leads",
  "invoice_overdue",
  "dsa_stale_files",
  "payout_chase",
  "cash_warning",
  "renewals",
  "weekly_review",
  "recurring_catchup",
] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

export type ConfigField =
  | { key: string; label: string; type: "number"; min?: number; max?: number; suffix?: string; hint?: string }
  | { key: string; label: string; type: "list"; hint?: string };

export type RuleMeta = {
  key: RuleKey;
  name: string;
  /** One friendly sentence */
  description: string;
  trigger: string;
  action: string;
  channel: string;
  /** lucide icon name, mapped in the UI */
  icon: "sunrise" | "receipt" | "phone" | "hourglass" | "file-warning" | "landmark" | "wallet" | "wallet-cards" | "calendar-sync" | "clipboard-check" | "repeat";
  tone: "brand" | "good" | "warn" | "bad" | "info" | "violet";
  defaultConfig: Record<string, unknown>;
  fields: ConfigField[];
};

export const DSA_STAGE_LIMIT_DEFAULTS: Record<string, number> = {
  lead: 2,
  eligibility: 2,
  documents: 5,
  logged_in: 5,
  credit_query: 4,
  sanctioned: 7,
  disbursed: 30,
  payout_invoiced: 30,
};

export const DSA_STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  eligibility: "Eligibility",
  documents: "Documents",
  logged_in: "Logged in",
  credit_query: "Credit query",
  sanctioned: "Sanctioned",
  disbursed: "Disbursed",
  payout_invoiced: "Payout invoiced",
  payout_received: "Payout received",
  rejected: "Rejected",
  dropped: "Dropped",
};

export const RULES: RuleMeta[] = [
  {
    key: "daily_digest",
    name: "Morning digest",
    description: "One calm summary of your day: tasks, follow-ups, bills, files to chase, overdue invoices and cash.",
    trigger: "Every day at your digest time",
    action: "Builds your briefing",
    channel: "Alert + push + email",
    icon: "sunrise",
    tone: "brand",
    defaultConfig: {},
    fields: [],
  },
  {
    key: "bill_reminders",
    name: "Bill reminders",
    description: "Nudges you before each bill, EMI or subscription is due (per the bill's own reminder days) and if one slips past.",
    trigger: "Days before a bill is due, or when overdue",
    action: "Reminds you of the amount and payee",
    channel: "Alert + push",
    icon: "receipt",
    tone: "warn",
    defaultConfig: {},
    fields: [],
  },
  {
    key: "lead_followups",
    name: "Lead follow-ups",
    description: "Reminds you about open leads whose follow-up time has passed, or that have no follow-up planned.",
    trigger: "Follow-up time passes (or none set)",
    action: "One reminder per lead per day",
    channel: "Alert + push",
    icon: "phone",
    tone: "info",
    defaultConfig: { remindMissing: 1 },
    fields: [{ key: "remindMissing", label: "Remind when no follow-up is set (1 = yes, 0 = no)", type: "number", min: 0, max: 1 }],
  },
  {
    key: "stale_leads",
    name: "Stale leads",
    description: "When an open lead goes quiet, adds a follow-up task to today so nothing goes cold.",
    trigger: "No activity on a lead for N days",
    action: "Creates a “Follow up” task",
    channel: "Task + alert",
    icon: "hourglass",
    tone: "warn",
    defaultConfig: { days: 7 },
    fields: [{ key: "days", label: "Quiet for", type: "number", min: 1, max: 90, suffix: "days" }],
  },
  {
    key: "invoice_overdue",
    name: "Overdue invoices",
    description: "Flags unpaid invoices after their due date, with a ready-to-send reminder message.",
    trigger: "Days past the due date",
    action: "Drafts a polite payment reminder",
    channel: "Alert + push",
    icon: "file-warning",
    tone: "bad",
    defaultConfig: { days: [1, 7, 15] },
    fields: [{ key: "days", label: "Remind on days past due", type: "list", hint: "Comma separated, e.g. 1, 7, 15" }],
  },
  {
    key: "dsa_stale_files",
    name: "DSA files stuck in a stage",
    description: "Spots loan files sitting in one stage longer than usual and adds a chase task for the RM or borrower.",
    trigger: "Days in the current stage exceed the limit",
    action: "Creates a “Chase” task",
    channel: "Task + alert",
    icon: "landmark",
    tone: "warn",
    defaultConfig: { stageLimits: { ...DSA_STAGE_LIMIT_DEFAULTS } },
    fields: Object.keys(DSA_STAGE_LIMIT_DEFAULTS).map((s) => ({
      key: `stageLimits.${s}`,
      label: DSA_STAGE_LABELS[s],
      type: "number" as const,
      min: 1,
      max: 180,
      suffix: "days",
    })),
  },
  {
    key: "payout_chase",
    name: "Payout chase",
    description: "When a lender's commission payout is late, adds a chase task (at most once a week per payout).",
    trigger: "Expected payout date passes",
    action: "Creates a “Chase payout” task",
    channel: "Task + alert",
    icon: "wallet",
    tone: "warn",
    defaultConfig: { graceDays: 30 },
    fields: [{ key: "graceDays", label: "No expected date? Chase after disbursal +", type: "number", min: 1, max: 120, suffix: "days" }],
  },
  {
    key: "cash_warning",
    name: "Cash-flow warning",
    description: "Looks 30 days ahead and warns you early if your balance would dip below your minimum, with payments you could move.",
    trigger: "Forecast shows a shortfall",
    action: "Suggests bills to reschedule",
    channel: "Alert + push",
    icon: "wallet-cards",
    tone: "bad",
    defaultConfig: { days: 30 },
    fields: [{ key: "days", label: "Look ahead", type: "number", min: 7, max: 90, suffix: "days" }],
  },
  {
    key: "renewals",
    name: "Renewals",
    description: "Passports, insurance, PUC, licences — adds a renewal task well before something expires.",
    trigger: "Inside each renewal's reminder window",
    action: "Creates a “Renew” task",
    channel: "Task + alert",
    icon: "calendar-sync",
    tone: "info",
    defaultConfig: {},
    fields: [],
  },
  {
    key: "weekly_review",
    name: "Weekly review",
    description: "Your week in one page: done vs planned, hours, money in and out, pipeline moves, disbursals and payouts.",
    trigger: "Your review day, after 6 pm",
    action: "Builds the week's scorecard",
    channel: "Alert + push + email",
    icon: "clipboard-check",
    tone: "violet",
    defaultConfig: {},
    fields: [],
  },
  {
    key: "recurring_catchup",
    name: "Recurring safety net",
    description: "If a repeating task or bill somehow lost its next instance, quietly creates it so the series never breaks.",
    trigger: "A series has no upcoming instance",
    action: "Creates the next one",
    channel: "Silent (alert when it fixes something)",
    icon: "repeat",
    tone: "good",
    defaultConfig: {},
    fields: [],
  },
];

export const RULE_META: Record<RuleKey, RuleMeta> = Object.fromEntries(RULES.map((r) => [r.key, r])) as Record<RuleKey, RuleMeta>;

/** Merges stored config over defaults (one level deep for nested objects like stageLimits). */
export function mergeConfig(key: RuleKey, stored: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const def = RULE_META[key].defaultConfig;
  const out: Record<string, unknown> = { ...def };
  for (const [k, v] of Object.entries(stored ?? {})) {
    const d = def[k];
    if (d && typeof d === "object" && !Array.isArray(d) && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = { ...(d as object), ...(v as object) };
    } else if (v !== undefined && v !== null) {
      out[k] = v;
    }
  }
  return out;
}

/** Reads a numeric config value with a fallback and bounds. */
export function numConfig(config: Record<string, unknown>, key: string, fallback: number, min = -Infinity, max = Infinity): number {
  const v = Number(config[key]);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Reads a list of positive integers (array or comma-separated string). */
export function listConfig(config: Record<string, unknown>, key: string, fallback: number[]): number[] {
  const v = config[key];
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : null;
  if (!raw) return fallback;
  const nums = raw.map((x) => Number(String(x).trim())).filter((n) => Number.isInteger(n) && n >= 0);
  return nums.length ? [...new Set(nums)].sort((a, b) => a - b) : fallback;
}
