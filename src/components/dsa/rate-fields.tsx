import type { InferSelectModel } from "drizzle-orm";
import type { payoutRates } from "@/db/schema";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { bpsToPercent } from "@/lib/money";
import { ProductSelect } from "./fields";

type Rate = InferSelectModel<typeof payoutRates>;

/** Paise → lakhs for the edit form (₹1L = 1,00,00,000 paise). */
function toLakhs(p: number | null | undefined): string {
  if (p == null) return "";
  return String(Math.round((p / 10_000_000) * 10000) / 10000);
}

export function RateFields({ r }: { r?: Rate }) {
  return (
    <FormGrid>
      <Field label="Product" className="sm:col-span-2">
        <ProductSelect defaultValue={r?.product} />
      </Field>
      <Field label="Min ticket" hint="Blank = from zero">
        <Input name="minTicket" inputMode="decimal" defaultValue={r && r.minTicketPaise ? toLakhs(r.minTicketPaise) : ""} placeholder="e.g. 30" />
      </Field>
      <Field label="Max ticket" hint="Blank = no upper limit">
        <Input name="maxTicket" inputMode="decimal" defaultValue={toLakhs(r?.maxTicketPaise)} placeholder="e.g. 75" />
      </Field>
      <Field label="Ticket sizes in">
        <Select name="unit" defaultValue="lakhs">
          <option value="lakhs">Lakhs</option>
          <option value="crores">Crores</option>
          <option value="rupees">Rupees</option>
        </Select>
      </Field>
      <Field label="Payout rate (%)" hint="Of the disbursed amount">
        <Input name="rate" inputMode="decimal" required defaultValue={r ? bpsToPercent(r.rateBps) : ""} placeholder="e.g. 0.65" />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Input name="notes" defaultValue={r?.notes ?? ""} placeholder="e.g. Valid till 31 Mar, excludes BT" />
      </Field>
    </FormGrid>
  );
}
