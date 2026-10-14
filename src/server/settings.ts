import "server-only";
import { cache } from "react";
import { db } from "@/db";
import { settings } from "@/db/schema";

export type AppSettings = {
  business: {
    name: string;
    legalName: string;
    gstin: string;
    pan: string;
    /** Two-digit GST state code of the business, e.g. "27" */
    stateCode: string;
    address: string;
    email: string;
    phone: string;
    bankName: string;
    bankAccountNo: string;
    bankIfsc: string;
    upiId: string;
    invoicePrefix: string;
    quotePrefix: string;
    defaultPaymentTermsDays: number;
    defaultInvoiceTerms: string;
  };
  planning: {
    /** Hours per working day you can plan tasks for; drives ETAs */
    dailyHours: number;
    /** 0 = Sunday … 6 = Saturday */
    workdays: number[];
  };
  finance: {
    /** Cash-flow warning threshold across all accounts */
    minBalancePaise: number;
    /** TDS usually deducted on commission/payout (section 194H) */
    commissionTdsBps: number;
    /** GST charged on DSA payout invoices, 0 if not registered */
    commissionGstBps: number;
  };
  notifications: {
    timezone: string;
    digestTime: string;
    digestEmail: string;
    emailEnabled: boolean;
    pushEnabled: boolean;
    /** 0 = Sunday */
    weeklyReviewDay: number;
  };
};

export const DEFAULT_SETTINGS: AppSettings = {
  business: {
    name: "MahiSys",
    legalName: "",
    gstin: "",
    pan: "",
    stateCode: "",
    address: "",
    email: "",
    phone: "",
    bankName: "",
    bankAccountNo: "",
    bankIfsc: "",
    upiId: "",
    invoicePrefix: "MS",
    quotePrefix: "QT",
    defaultPaymentTermsDays: 15,
    defaultInvoiceTerms: "Payment due within 15 days of the invoice date.",
  },
  planning: { dailyHours: 6, workdays: [1, 2, 3, 4, 5, 6] },
  finance: { minBalancePaise: 2_500_000, commissionTdsBps: 200, commissionGstBps: 0 },
  notifications: {
    timezone: "Asia/Kolkata",
    digestTime: "08:00",
    digestEmail: "",
    emailEnabled: true,
    pushEnabled: true,
    weeklyReviewDay: 0,
  },
};

type SectionKey = keyof AppSettings;

/** All settings, merged over defaults. Cached per request. */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await db.select().from(settings);
  const out = structuredClone(DEFAULT_SETTINGS) as AppSettings;
  for (const r of rows) {
    if (r.key in out) {
      const k = r.key as SectionKey;
      out[k] = { ...out[k], ...(r.value as object) } as never;
    }
  }
  return out;
});

export async function saveSettingsSection<K extends SectionKey>(key: K, value: Partial<AppSettings[K]>) {
  const current = (await getSettings())[key];
  const merged = { ...current, ...value };
  await db
    .insert(settings)
    .values({ key, value: merged })
    .onConflictDoUpdate({ target: settings.key, set: { value: merged, updatedAt: new Date() } });
}
