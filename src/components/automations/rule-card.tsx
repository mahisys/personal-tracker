"use client";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, ChevronDown, Play, SlidersHorizontal } from "lucide-react";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Field, Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { RuleMeta } from "@/server/automations/meta";
import { runAutomationsNow, saveRuleConfig, toggleRule } from "@/server/automations/actions";
import { RULE_ICONS, TONE_TILE } from "./rule-icon";

export type RuleCardData = {
  meta: RuleMeta;
  enabled: boolean;
  config: Record<string, unknown>;
  lastRunLabel: string | null;
  lastResult: string | null;
  lastError: boolean;
};

function valueFor(config: Record<string, unknown>, key: string): string {
  const [head, sub] = key.split(".");
  const v = sub ? (config[head] as Record<string, unknown> | undefined)?.[sub] : config[head];
  if (Array.isArray(v)) return v.join(", ");
  return v == null ? "" : String(v);
}

/** Accessible on/off switch with optimistic state. */
export function RuleSwitch({ ruleKey, enabled, label }: { ruleKey: string; enabled: boolean; label: string }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label}: ${on ? "on" : "off"}`}
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          const fd = new FormData();
          fd.set("key", ruleKey);
          fd.set("enabled", String(next));
          const res = await toggleRule(undefined, fd);
          if (res?.error) {
            setOn(!next);
            toast.error(res.error);
          } else if (res?.message) toast.success(res.message);
        });
      }}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        on ? "bg-[linear-gradient(135deg,var(--brand),var(--brand-2))]" : "bg-muted ring-1 ring-inset ring-line-strong",
      )}
    >
      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 34 }} className={cn("h-6 w-6 rounded-full bg-white shadow-md", on ? "ml-auto" : "ml-0")} />
    </button>
  );
}

export function RuleCard({ data }: { data: RuleCardData }) {
  const { meta } = data;
  const Icon = RULE_ICONS[meta.icon];
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("glass flex flex-col rounded-[var(--radius-card)] border border-line shadow-card transition-all duration-300 hover:shadow-pop", !data.enabled && "opacity-75")}>
      <div className="flex items-start gap-3 p-5 pb-3">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", TONE_TILE[meta.tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[15px] font-bold text-fg">{meta.name}</h3>
            <RuleSwitch ruleKey={meta.key} enabled={data.enabled} label={meta.name} />
          </div>
          <p className="mt-1 text-sm text-fg-muted">{meta.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-5 text-[11px] font-semibold">
        <span className="rounded-full bg-muted px-2.5 py-1 text-fg-muted">{meta.trigger}</span>
        <ArrowRight className="h-3 w-3 text-fg-subtle" />
        <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand">{meta.action}</span>
        <ArrowRight className="h-3 w-3 text-fg-subtle" />
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-300">{meta.channel}</span>
      </div>

      <div className="mt-auto px-5 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2 text-xs">
          <div className="min-w-0">
            <div className="font-semibold text-fg-subtle">{data.lastRunLabel ? `Last run ${data.lastRunLabel}` : "Not run yet"}</div>
            {data.lastResult ? <div className={cn("truncate font-semibold", data.lastError ? "text-bad" : "text-fg")}>{data.lastResult}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {meta.fields.length ? (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2 font-semibold text-fg-muted transition hover:bg-brand-soft hover:text-fg"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tune</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
              </button>
            ) : null}
            <ActionButton action={runAutomationsNow} hidden={{ key: meta.key }} variant="soft" size="sm" title={`Run ${meta.name} now`}>
              <Play className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Run</span>
            </ActionButton>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
              <ActionForm action={saveRuleConfig} resetOnSuccess={false} className="pt-4">
                <input type="hidden" name="key" value={meta.key} />
                <div className={cn("grid gap-3", meta.fields.length > 2 ? "grid-cols-2" : "grid-cols-1")}>
                  {meta.fields.map((f) => (
                    <Field key={f.key} label={f.type === "number" && f.suffix ? `${f.label} (${f.suffix})` : f.label} hint={f.hint}>
                      <Input
                        name={f.key}
                        defaultValue={valueFor(data.config, f.key)}
                        inputMode={f.type === "number" ? "numeric" : "text"}
                        type={f.type === "number" ? "number" : "text"}
                        min={f.type === "number" ? f.min : undefined}
                        max={f.type === "number" ? f.max : undefined}
                      />
                    </Field>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <SubmitButton size="sm" pendingText="Saving…">
                    Save
                  </SubmitButton>
                </div>
              </ActionForm>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
