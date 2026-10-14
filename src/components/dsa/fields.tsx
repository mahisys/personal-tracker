/** Field groups shared by DSA forms. Server-safe: plain inputs, no hooks. */
import type { InferSelectModel } from "drizzle-orm";
import type { borrowers, lenders, subConnectors } from "@/db/schema";
import { Checkbox, Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { bpsToPercent, paiseToInput } from "@/lib/money";
import { EMPLOYMENT_LABELS, LEAD_SOURCES, LENDER_TYPE_LABELS, PRODUCT_LABELS } from "@/server/dsa/constants";

type Borrower = InferSelectModel<typeof borrowers>;
type Lender = InferSelectModel<typeof lenders>;
type Partner = InferSelectModel<typeof subConnectors>;
export type PartnerOption = { id: string; name: string };

export function BorrowerFields({ b, partners, prefix = "" }: { b?: Partial<Borrower>; partners: PartnerOption[]; prefix?: string }) {
  const n = (k: string) => `${prefix}${k}`;
  return (
    <FormGrid>
      <Field label="Name" className="sm:col-span-2">
        <Input name={n("name")} defaultValue={b?.name ?? ""} required placeholder="Full name as on PAN" autoComplete="off" />
      </Field>
      <Field label="Phone">
        <Input name={n("phone")} type="tel" inputMode="tel" defaultValue={b?.phone ?? ""} placeholder="98xxxxxxxx" />
      </Field>
      <Field label="City">
        <Input name={n("city")} defaultValue={b?.city ?? ""} placeholder="e.g. Pune" />
      </Field>
      <Field label="Employment">
        <Select name={n("employmentType")} defaultValue={b?.employmentType ?? "salaried"}>
          {Object.entries(EMPLOYMENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Monthly income">
        <MoneyInput name={n("monthlyIncome")} defaultValue={paiseToInput(b?.monthlyIncomePaise)} placeholder="Net / month" />
      </Field>
      <Field label="CIBIL score">
        <Input name={n("cibilScore")} type="number" min={300} max={900} inputMode="numeric" defaultValue={b?.cibilScore ?? ""} placeholder="300–900" />
      </Field>
      <Field label="Source">
        <Input name={n("source")} list="dsa-sources" defaultValue={b?.source ?? ""} placeholder="Referral, walk-in…" />
        <datalist id="dsa-sources">
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Field label="Sub-connector" className="sm:col-span-2" hint="Their share is worked out automatically on payouts">
        <Select name={n("subConnectorId")} defaultValue={b?.subConnectorId ?? ""}>
          <option value="">None — my own lead</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      {prefix === "" ? (
        <>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={b?.email ?? ""} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea name="notes" defaultValue={b?.notes ?? ""} rows={2} />
          </Field>
        </>
      ) : null}
    </FormGrid>
  );
}

export function ProductSelect({ defaultValue, name = "product" }: { defaultValue?: string; name?: string }) {
  return (
    <Select name={name} defaultValue={defaultValue ?? "home_loan"}>
      {Object.entries(PRODUCT_LABELS).map(([p, label]) => (
        <option key={p} value={p}>
          {label}
        </option>
      ))}
    </Select>
  );
}

export function LenderFields({ l }: { l?: Lender }) {
  return (
    <FormGrid>
      <Field label="Lender name" className="sm:col-span-2">
        <Input name="name" defaultValue={l?.name ?? ""} required placeholder="e.g. HDFC Bank" />
      </Field>
      <Field label="Type">
        <Select name="type" defaultValue={l?.type ?? "bank"}>
          {Object.entries(LENDER_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Your DSA code">
        <Input name="dsaCode" defaultValue={l?.dsaCode ?? ""} placeholder="Connector / DSA code" />
      </Field>
      <Field label="RM name">
        <Input name="rmName" defaultValue={l?.rmName ?? ""} />
      </Field>
      <Field label="RM phone">
        <Input name="rmPhone" type="tel" defaultValue={l?.rmPhone ?? ""} />
      </Field>
      <Field label="RM email">
        <Input name="rmEmail" type="email" defaultValue={l?.rmEmail ?? ""} />
      </Field>
      <Field label="Pays out in (days)" hint="After disbursal, usually">
        <Input name="payoutDays" type="number" min={0} max={365} defaultValue={l?.payoutDays ?? 30} />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea name="notes" defaultValue={l?.notes ?? ""} rows={2} placeholder="Policy quirks, cut-offs, who to escalate to" />
      </Field>
      {l ? <Checkbox name="active" defaultChecked={l.active} label="Active — show in pickers" /> : null}
    </FormGrid>
  );
}

export function PartnerFields({ p }: { p?: Partner }) {
  return (
    <FormGrid>
      <Field label="Name" className="sm:col-span-2">
        <Input name="name" defaultValue={p?.name ?? ""} required />
      </Field>
      <Field label="Phone">
        <Input name="phone" type="tel" defaultValue={p?.phone ?? ""} />
      </Field>
      <Field label="Share of your payout (%)" hint="e.g. 25 means they get a quarter of your gross">
        <Input name="share" inputMode="decimal" defaultValue={p ? bpsToPercent(p.shareBps) : ""} placeholder="25" />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea name="notes" defaultValue={p?.notes ?? ""} rows={2} />
      </Field>
      {p ? <Checkbox name="active" defaultChecked={p.active} label="Active" /> : null}
    </FormGrid>
  );
}
