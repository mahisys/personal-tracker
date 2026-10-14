import { BellRing, Building2, CalendarClock, CheckCircle2, CircleDashed, Download, Info, Landmark, ShieldCheck, Wallet } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { publicFirebaseConfig } from "@/server/firebase-admin";
import { emailConfigured } from "@/server/messaging/email";
import { pushConfigured } from "@/server/messaging/push";
import { saveBusinessSettings, saveFinanceSettings, saveNotificationSettings, savePlanningSettings } from "@/server/settings-actions/actions";
import { sendTestNotification } from "@/server/automations/actions";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { buttonClass } from "@/components/ui/button";
import { ToggleRow } from "@/components/settings/toggle-row";
import { EnablePushButton, GstinAndState, SignOutButton, WorkdayChips } from "@/components/settings/fields";
import { bpsToPercent, paiseToInput } from "@/lib/money";
import { todayIST } from "@/lib/dates";
import pkg from "../../../../package.json";

export const metadata = { title: "Settings" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function SaveRow({ children = "Save" }: { children?: React.ReactNode }) {
  return (
    <div className="mt-6 flex justify-end">
      <SubmitButton pendingText="Saving…">{children}</SubmitButton>
    </div>
  );
}

function Status({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {ok ? <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-500" /> : <CircleDashed className="mt-0.5 h-4.5 w-4.5 shrink-0 text-fg-subtle" />}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg">{label}</div>
        <div className="text-xs text-fg-muted">{hint}</div>
      </div>
    </li>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const s = await getSettings();
  const b = s.business;
  const fb = publicFirebaseConfig();
  const revision = process.env.K_REVISION ?? process.env.APP_VERSION ?? null;

  return (
    <>
      <PageHeader eyebrow="Insights" title="Settings" description="Your business details, planning rhythm, money guardrails and how we keep you posted." />

      <div className="stagger grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader title="Business profile" description="Printed on invoices and quotes." icon={<Building2 className="h-4.5 w-4.5" />} />
          <CardBody>
            <ActionForm action={saveBusinessSettings} resetOnSuccess={false}>
              <FormGrid cols={3}>
                <Field label="Business name">
                  <Input name="name" defaultValue={b.name} required />
                </Field>
                <Field label="Legal name" hint="As registered, if different">
                  <Input name="legalName" defaultValue={b.legalName} />
                </Field>
                <Field label="PAN">
                  <Input name="pan" defaultValue={b.pan} maxLength={10} className="uppercase tracking-wider" />
                </Field>
                <GstinAndState gstin={b.gstin} stateCode={b.stateCode} />
                <Field label="Phone">
                  <Input name="phone" type="tel" defaultValue={b.phone} />
                </Field>
                <Field label="Email">
                  <Input name="email" type="email" defaultValue={b.email} />
                </Field>
                <Field label="Address" className="sm:col-span-3">
                  <Textarea name="address" defaultValue={b.address} rows={2} />
                </Field>
              </FormGrid>

              <div className="mb-3 mt-7 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-fg-subtle">
                <Landmark className="h-3.5 w-3.5" /> Bank & UPI
              </div>
              <FormGrid cols={4}>
                <Field label="Bank name">
                  <Input name="bankName" defaultValue={b.bankName} />
                </Field>
                <Field label="Account number">
                  <Input name="bankAccountNo" defaultValue={b.bankAccountNo} inputMode="numeric" />
                </Field>
                <Field label="IFSC">
                  <Input name="bankIfsc" defaultValue={b.bankIfsc} maxLength={11} className="uppercase tracking-wider" />
                </Field>
                <Field label="UPI ID" hint="Adds a UPI line to invoices">
                  <Input name="upiId" defaultValue={b.upiId} placeholder="name@okhdfcbank" />
                </Field>
              </FormGrid>

              <div className="mb-3 mt-7 text-xs font-bold uppercase tracking-[0.14em] text-fg-subtle">Invoices & quotes</div>
              <FormGrid cols={3}>
                <Field label="Invoice prefix" hint="e.g. MS → MS/2026-27/001">
                  <Input name="invoicePrefix" defaultValue={b.invoicePrefix} maxLength={10} />
                </Field>
                <Field label="Quote prefix">
                  <Input name="quotePrefix" defaultValue={b.quotePrefix} maxLength={10} />
                </Field>
                <Field label="Payment terms (days)">
                  <Input name="defaultPaymentTermsDays" type="number" min={0} max={365} defaultValue={b.defaultPaymentTermsDays} />
                </Field>
                <Field label="Default invoice terms" className="sm:col-span-3">
                  <Textarea name="defaultInvoiceTerms" defaultValue={b.defaultInvoiceTerms} rows={2} />
                </Field>
              </FormGrid>
              <SaveRow>Save business profile</SaveRow>
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Planning" description="How much focused time you have — drives task ETAs." icon={<CalendarClock className="h-4.5 w-4.5" />} />
          <CardBody>
            <ActionForm action={savePlanningSettings} resetOnSuccess={false}>
              <div className="space-y-5">
                <Field label="Hours you can plan per working day">
                  <Input name="dailyHours" type="number" step={0.5} min={0.5} max={16} defaultValue={s.planning.dailyHours} className="max-w-40" />
                </Field>
                <Field label="Working days">
                  <WorkdayChips value={s.planning.workdays} />
                </Field>
              </div>
              <SaveRow />
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Finance" description="Guardrails for cash flow and DSA commission maths." icon={<Wallet className="h-4.5 w-4.5" />} />
          <CardBody>
            <ActionForm action={saveFinanceSettings} resetOnSuccess={false}>
              <FormGrid cols={1}>
                <Field label="Minimum balance" hint="We warn you before cash dips below this">
                  <MoneyInput name="minBalance" defaultValue={paiseToInput(s.finance.minBalancePaise)} />
                </Field>
                <FormGrid cols={2}>
                  <Field label="Commission TDS %" hint="Usually 2% (section 194H)">
                    <Input name="commissionTds" inputMode="decimal" defaultValue={bpsToPercent(s.finance.commissionTdsBps)} />
                  </Field>
                  <Field label="Commission GST %" hint="0 if you're not registered">
                    <Input name="commissionGst" inputMode="decimal" defaultValue={bpsToPercent(s.finance.commissionGstBps)} />
                  </Field>
                </FormGrid>
              </FormGrid>
              <SaveRow />
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Notifications" description="A calm morning digest and only the nudges that matter." icon={<BellRing className="h-4.5 w-4.5" />} />
          <CardBody>
            <ActionForm action={saveNotificationSettings} resetOnSuccess={false}>
              <FormGrid cols={2}>
                <Field label="Morning digest at (IST)">
                  <Input name="digestTime" type="time" defaultValue={s.notifications.digestTime} required />
                </Field>
                <Field label="Weekly review on">
                  <Select name="weeklyReviewDay" defaultValue={String(s.notifications.weeklyReviewDay)}>
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}, 6 pm
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Send digest emails to" className="sm:col-span-2" hint={`Leave empty to use ${process.env.GMAIL_SENDER || "the sender address"}`}>
                  <Input name="digestEmail" type="email" defaultValue={s.notifications.digestEmail} placeholder={user.email} />
                </Field>
              </FormGrid>
              <div className="mt-4 space-y-2">
                <ToggleRow name="emailEnabled" label="Email" description="Morning digest and weekly review by email" defaultChecked={s.notifications.emailEnabled} />
                <ToggleRow name="pushEnabled" label="Push notifications" description="Reminders on your phone and laptop" defaultChecked={s.notifications.pushEnabled} />
              </div>
              <SaveRow />
            </ActionForm>
            <div className="mt-6 space-y-3 border-t border-line pt-5">
              <EnablePushButton config={fb} />
              <div className="flex flex-wrap gap-2">
                <ActionButton action={sendTestNotification} variant="secondary" size="md">
                  <BellRing className="h-4 w-4" /> Send test notification
                </ActionButton>
                <ActionButton action={sendTestNotification} hidden={{ email: "1" }} variant="ghost" size="md">
                  Test push + email
                </ActionButton>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Data & account" description="Your data is yours — take it anywhere." icon={<ShieldCheck className="h-4.5 w-4.5" />} />
          <CardBody className="space-y-5">
            <div className="rounded-2xl border border-line bg-[linear-gradient(135deg,var(--brand-soft),transparent)] p-4">
              <div className="text-sm font-bold text-fg">Export everything to Excel</div>
              <p className="mt-0.5 text-xs text-fg-muted">One sheet per table — tasks, CRM, invoices, books, planner and DSA. Amounts in rupees.</p>
              <a href="/api/export?format=xlsx" download={`command-center-${todayIST()}.xlsx`} className={buttonClass("primary", "md", "mt-3")}>
                <Download className="h-4 w-4" /> Download .xlsx
              </a>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <div className="text-xs font-semibold text-fg-subtle">Signed in as</div>
                <div className="truncate font-semibold text-fg">{user.email}</div>
              </div>
              <SignOutButton />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="About this app" description="Connections and version." icon={<Info className="h-4.5 w-4.5" />} />
          <CardBody>
            <ul className="divide-y divide-line">
              <Status ok={pushConfigured() && Boolean(fb.apiKey && fb.vapidKey)} label="Push (Firebase Cloud Messaging)" hint={fb.projectId ? `Project ${fb.projectId}` : "Set FIREBASE_* variables"} />
              <Status ok={emailConfigured()} label="Email (Gmail API)" hint={emailConfigured() ? `Sending as ${process.env.GMAIL_SENDER}` : "Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER"} />
              <Status ok={Boolean(process.env.CRON_SECRET)} label="Scheduler (every 15 min)" hint={process.env.CRON_SECRET ? "Cloud Scheduler → POST /api/cron/run" : "Set CRON_SECRET and create the Cloud Scheduler job"} />
              <Status ok={Boolean(process.env.APP_URL)} label="App URL for email links" hint={process.env.APP_URL || "Set APP_URL"} />
            </ul>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-subtle">
              <span>
                Command Center <span className="font-semibold text-fg-muted">v{pkg.version}</span>
              </span>
              {revision ? <span>Revision {revision}</span> : null}
              <span>Times in IST · Amounts in ₹</span>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
