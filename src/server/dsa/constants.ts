/**
 * Reference data for the DSA desk. Pure and client-safe (no server imports), so client
 * components can show labels and checklists too.
 */
import type { LoanProduct, LoanStage, PendingWith } from "@/db/schema";

export type EmploymentType = "salaried" | "self_employed" | "business" | "other";
export type LenderType = "bank" | "nbfc" | "hfc" | "other";
export type DocStatus = "pending" | "received" | "submitted" | "not_needed";

/** The happy path, in order. */
export const PIPELINE_STAGES = [
  "lead",
  "eligibility",
  "documents",
  "logged_in",
  "credit_query",
  "sanctioned",
  "disbursed",
  "payout_invoiced",
  "payout_received",
] as const satisfies readonly LoanStage[];

export const CLOSED_STAGES = ["rejected", "dropped"] as const satisfies readonly LoanStage[];

/** Stages shown as columns on the board (everything still in motion). */
export const BOARD_STAGES = PIPELINE_STAGES.filter((s) => s !== "payout_received") as LoanStage[];

/** Files in these stages are "active" (not finished, not closed). */
export const ACTIVE_STAGES: LoanStage[] = [...BOARD_STAGES];

export const STAGE_LABELS: Record<LoanStage, string> = {
  lead: "Lead",
  eligibility: "Eligibility check",
  documents: "Documents collecting",
  logged_in: "Logged in",
  credit_query: "Credit / query",
  sanctioned: "Sanctioned",
  disbursed: "Disbursed",
  payout_invoiced: "Payout invoiced",
  payout_received: "Payout received",
  rejected: "Rejected",
  dropped: "Dropped",
};

/** Short labels for tight places (stepper on phones). */
export const STAGE_SHORT: Record<LoanStage, string> = {
  lead: "Lead",
  eligibility: "Eligibility",
  documents: "Docs",
  logged_in: "Login",
  credit_query: "Credit",
  sanctioned: "Sanction",
  disbursed: "Disbursed",
  payout_invoiced: "Invoiced",
  payout_received: "Paid out",
  rejected: "Rejected",
  dropped: "Dropped",
};

/** Default days a file should sit in each stage before it counts as stale. */
export const STAGE_LIMIT_DAYS: Partial<Record<LoanStage, number>> = {
  lead: 2,
  eligibility: 2,
  documents: 5,
  logged_in: 5,
  credit_query: 4,
  sanctioned: 7,
  disbursed: 30,
  payout_invoiced: 30,
};

/** Who the file usually waits on right after it enters a stage. */
export const STAGE_DEFAULT_PENDING: Record<LoanStage, PendingWith> = {
  lead: "me",
  eligibility: "me",
  documents: "customer",
  logged_in: "lender",
  credit_query: "lender",
  sanctioned: "customer",
  disbursed: "lender",
  payout_invoiced: "lender",
  payout_received: "none",
  rejected: "none",
  dropped: "none",
};

export const PENDING_LABELS: Record<PendingWith, string> = {
  customer: "Customer",
  me: "Me",
  lender: "Lender",
  valuation_legal: "Valuation / legal",
  none: "Nobody",
};

export const PENDING_ORDER: PendingWith[] = ["me", "customer", "lender", "valuation_legal", "none"];

export const PRODUCT_LABELS: Record<LoanProduct, string> = {
  home_loan: "Home loan",
  lap: "Loan against property",
  personal_loan: "Personal loan",
  business_loan: "Business loan",
  car_loan: "Car loan",
  education_loan: "Education loan",
  working_capital: "Working capital / OD-CC",
  other: "Other",
};

export const PRODUCT_SHORT: Record<LoanProduct, string> = {
  home_loan: "HL",
  lap: "LAP",
  personal_loan: "PL",
  business_loan: "BL",
  car_loan: "Car",
  education_loan: "Edu",
  working_capital: "WC",
  other: "Other",
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  salaried: "Salaried",
  self_employed: "Self-employed professional",
  business: "Business owner",
  other: "Other",
};

export const LENDER_TYPE_LABELS: Record<LenderType, string> = {
  bank: "Bank",
  nbfc: "NBFC",
  hfc: "Housing finance co.",
  other: "Other",
};

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pending: "Pending",
  received: "Received",
  submitted: "Submitted to lender",
  not_needed: "Not needed",
};

/** Next status when a checklist item is tapped. */
export const DOC_NEXT_STATUS: Record<DocStatus, DocStatus> = {
  pending: "received",
  received: "submitted",
  submitted: "pending",
  not_needed: "pending",
};

export const CLOSE_REASONS = [
  "Low CIBIL / bureau issues",
  "Income not eligible",
  "Negative profile / location",
  "Property not approved",
  "Customer not interested",
  "Got a better offer elsewhere",
  "Documents not provided",
  "Not reachable",
];

export const LEAD_SOURCES = ["Referral", "Walk-in", "Builder / dealer", "Sub-connector", "Social media", "Existing customer", "Cold call"];

export function stageIndex(stage: LoanStage): number {
  return (PIPELINE_STAGES as readonly LoanStage[]).indexOf(stage);
}

export function isClosedStage(stage: LoanStage): boolean {
  return stage === "rejected" || stage === "dropped";
}

export function isActiveStage(stage: LoanStage): boolean {
  return ACTIVE_STAGES.includes(stage);
}

/** Fields the move dialog must collect for a target stage. */
export const STAGE_REQUIREMENTS: Partial<Record<LoanStage, string[]>> = {
  logged_in: ["applicationNo", "loginDate", "lenderId"],
  sanctioned: ["sanctioned", "sanctionDate"],
  disbursed: ["disbursed", "disbursalDate"],
  payout_invoiced: ["invoiceNo", "invoiceDate"],
  payout_received: ["receivedDate", "netReceived", "accountId"],
  rejected: ["closeReason"],
  dropped: ["closeReason"],
};

export function stageNeedsInput(stage: LoanStage): boolean {
  return (STAGE_REQUIREMENTS[stage]?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Document checklists (Indian lending practice)
// ---------------------------------------------------------------------------

const KYC = ["PAN card", "Aadhaar card", "Passport-size photo", "Current address proof"];

const SALARIED_INCOME = [
  "Salary slips — last 3 months",
  "Bank statement — last 6 months (salary account)",
  "Form 16 — last 2 years",
  "Employment proof / offer letter",
];

const SELF_EMPLOYED_INCOME = [
  "ITR with computation — last 3 years",
  "Audited financials (P&L, balance sheet) — last 2–3 years",
  "Bank statement — last 12 months (all current accounts)",
  "GST returns — last 12 months",
  "Business proof (Udyam / GST certificate / shop act)",
  "Office address proof",
];

const PROFESSIONAL_EXTRA = ["Professional qualification / registration certificate"];

const PROPERTY = [
  "Sale agreement / title deed chain",
  "Approved building plan",
  "OC / CC (occupancy / completion certificate)",
  "Property tax receipt",
  "Society / builder NOC",
  "Allotment letter",
];

const PRODUCT_EXTRA: Record<LoanProduct, string[]> = {
  home_loan: [...PROPERTY, "Own contribution receipts"],
  lap: [...PROPERTY, "Existing loan statement (if any)"],
  personal_loan: [],
  business_loan: ["Existing loan sanction letters & repayment track"],
  car_loan: ["Vehicle quotation / proforma invoice"],
  education_loan: [
    "Admission / offer letter",
    "Fee structure from the institute",
    "Academic mark sheets (10th, 12th, graduation)",
    "Co-applicant KYC (PAN, Aadhaar)",
    "Co-applicant income proof",
  ],
  working_capital: ["Stock & debtors statement", "Projected financials / CMA data", "Existing OD/CC sanction letter (if any)"],
  other: [],
};

/**
 * The default document checklist for a new file. Depends on the product AND how the borrower earns.
 * Education loans lean on the co-applicant's income, so the borrower's own income docs are skipped.
 */
export function defaultChecklist(product: LoanProduct, employment: EmploymentType | null | undefined): string[] {
  const out: string[] = [...KYC];
  if (product !== "education_loan") {
    if (employment === "self_employed") out.push(...SELF_EMPLOYED_INCOME, ...PROFESSIONAL_EXTRA);
    else if (employment === "business") out.push(...SELF_EMPLOYED_INCOME);
    else if (employment === "salaried") out.push(...SALARIED_INCOME);
    else if (product === "business_loan" || product === "working_capital") out.push(...SELF_EMPLOYED_INCOME);
    else out.push(...SALARIED_INCOME);
  }
  out.push(...PRODUCT_EXTRA[product]);
  return Array.from(new Set(out));
}
