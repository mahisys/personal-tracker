"use server";
import { revalidatePath } from "next/cache";
import { bool, done, fail, type ActionResult } from "@/lib/action";
import { requireUser } from "@/server/auth";
import { saveSettingsSection } from "@/server/settings";
import { validateBusiness, validateFinance, validateNotifications, validatePlanning } from "./validate";

function raw(form: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, form.get(k) == null ? null : String(form.get(k))]));
}

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function saveBusinessSettings(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const r = validateBusiness(
    raw(form, [
      "name",
      "legalName",
      "gstin",
      "pan",
      "stateCode",
      "address",
      "email",
      "phone",
      "bankName",
      "bankAccountNo",
      "bankIfsc",
      "upiId",
      "invoicePrefix",
      "quotePrefix",
      "defaultPaymentTermsDays",
      "defaultInvoiceTerms",
    ]),
  );
  if (r.error !== undefined) return fail(r.error);
  await saveSettingsSection("business", r.value);
  refresh();
  return done("Business profile saved");
}

export async function savePlanningSettings(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const r = validatePlanning(raw(form, ["dailyHours"]), form.getAll("workdays").map(String));
  if (r.error !== undefined) return fail(r.error);
  await saveSettingsSection("planning", r.value);
  refresh();
  return done("Planning saved — ETAs will use this");
}

export async function saveFinanceSettings(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const r = validateFinance(raw(form, ["minBalance", "commissionTds", "commissionGst"]));
  if (r.error !== undefined) return fail(r.error);
  await saveSettingsSection("finance", r.value);
  refresh();
  return done("Finance settings saved");
}

export async function saveNotificationSettings(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const r = validateNotifications(raw(form, ["digestTime", "digestEmail", "weeklyReviewDay"]), {
    emailEnabled: bool(form, "emailEnabled"),
    pushEnabled: bool(form, "pushEnabled"),
  });
  if (r.error !== undefined) return fail(r.error);
  await saveSettingsSection("notifications", r.value);
  refresh();
  return done("Notification preferences saved");
}
