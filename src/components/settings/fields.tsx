"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Loader2, LogOut, Smartphone } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { INDIAN_STATES, isValidGstin, stateCodeFromGstin } from "@/lib/gst";
import { enablePush } from "@/lib/client/firebase";
import type { PublicFirebaseConfig } from "@/server/firebase-admin";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Working-day chips; submits as repeated `workdays` fields. */
export function WorkdayChips({ value }: { value: number[] }) {
  const [days, setDays] = useState<number[]>(value);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
      {DAYS.map((d, i) => {
        const on = days.includes(i);
        return (
          <label
            key={d}
            className={cn(
              "flex h-10 min-w-12 cursor-pointer select-none items-center justify-center rounded-xl px-3 text-xs font-bold transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              on ? "bg-[linear-gradient(135deg,var(--brand),var(--brand-2))] text-white shadow-[0_6px_16px_-8px_var(--brand)]" : "bg-muted text-fg-muted hover:bg-brand-soft hover:text-fg",
            )}
          >
            <input type="checkbox" name="workdays" value={i} checked={on} onChange={() => setDays((p) => (on ? p.filter((x) => x !== i) : [...p, i]))} className="sr-only" />
            {d}
          </label>
        );
      })}
    </div>
  );
}

/** GSTIN with live validation; picking a valid GSTIN selects its state automatically. */
export function GstinAndState({ gstin, stateCode }: { gstin: string; stateCode: string }) {
  const [g, setG] = useState(gstin);
  const [st, setSt] = useState(stateCode);
  const clean = g.trim().toUpperCase();
  const valid = clean.length === 0 ? null : isValidGstin(clean);
  const derived = valid ? stateCodeFromGstin(clean) : null;
  const mismatch = Boolean(derived && st && derived !== st);
  const stateName = useMemo(() => INDIAN_STATES.find((x) => x.code === derived)?.name, [derived]);
  return (
    <>
      <Field
        label="GSTIN"
        hint={
          valid == null ? (
            "Leave empty if you're not GST registered"
          ) : valid ? (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Looks good{stateName ? ` · ${stateName}` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold text-bad">
              <CircleAlert className="h-3.5 w-3.5" /> 15 characters, like 27ABCDE1234F1Z5
            </span>
          )
        }
      >
        <Input
          name="gstin"
          value={g}
          maxLength={15}
          autoComplete="off"
          spellCheck={false}
          className={cn("uppercase tracking-wider", valid === false && "border-bad focus:border-bad focus:ring-bad/15")}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setG(v);
            if (isValidGstin(v)) {
              const code = stateCodeFromGstin(v);
              if (code) setSt(code);
            }
          }}
        />
      </Field>
      <Field label="GST state" hint={mismatch ? <span className="font-semibold text-bad">Doesn&apos;t match your GSTIN</span> : "Decides CGST + SGST vs IGST on invoices"}>
        <Select name="stateCode" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">Select state</option>
          {INDIAN_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code} · {s.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

/** "Enable push on this device" with friendly results. */
export function EnablePushButton({ config }: { config: PublicFirebaseConfig }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<string | null>(null);
  const configured = Boolean(config.apiKey && config.vapidKey);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button
        variant="soft"
        disabled={pending || !configured}
        onClick={() =>
          start(async () => {
            try {
              const r = await enablePush(config);
              setState(r);
              if (r === "enabled") toast.success("Push is on for this device 🎉");
              else if (r === "denied") toast.error("Notifications are blocked — allow them in your browser's site settings");
              else if (r === "unsupported") toast.error("This browser can't receive push. On iPhone, add the app to your Home Screen first.");
              else toast.error("Push isn't configured on the server yet");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Couldn't enable push");
            }
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "enabled" ? <CheckCircle2 className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
        {state === "enabled" ? "Enabled on this device" : "Enable push on this device"}
      </Button>
      {!configured ? <span className="text-xs text-fg-subtle">Set the FIREBASE_* variables to turn this on.</span> : null}
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await fetch("/api/auth/session", { method: "DELETE" });
          } finally {
            toast.success("Signed out — see you soon");
            router.push("/login");
            router.refresh();
          }
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      Sign out
    </Button>
  );
}

