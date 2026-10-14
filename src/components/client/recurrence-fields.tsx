"use client";
import { useState } from "react";
import type { Recurrence } from "@/db/schema";
import { Field, Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Form fields read on the server by recurrenceFromForm(). */
export function RecurrenceFields({ value }: { value?: Recurrence | null }) {
  const [freq, setFreq] = useState<string>(value?.freq ?? "none");
  const [days, setDays] = useState<number[]>(value?.byWeekday ?? []);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Field label="Repeats">
        <Select name="repeat" value={freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </Select>
      </Field>
      {freq !== "none" ? (
        <>
          <Field label="Every">
            <Input type="number" name="repeatEvery" min={1} defaultValue={value?.interval ?? 1} />
          </Field>
          <Field label="Until (optional)">
            <Input type="date" name="repeatUntil" defaultValue={value?.until ?? ""} />
          </Field>
        </>
      ) : null}
      {freq === "weekly" ? (
        <div className="sm:col-span-3 flex gap-1.5">
          {DAYS.map((d, i) => {
            const on = days.includes(i);
            return (
              <label key={i} className={cn("flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-xs font-bold transition", on ? "bg-brand text-white shadow-md" : "bg-muted text-fg-muted hover:bg-brand-soft")}>
                <input
                  type="checkbox"
                  name="repeatDays"
                  value={i}
                  checked={on}
                  onChange={() => setDays((p) => (on ? p.filter((x) => x !== i) : [...p, i]))}
                  className="sr-only"
                />
                {d}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
