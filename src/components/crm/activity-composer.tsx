"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { CalendarPlus, Mail, MapPin, MessageCircle, NotebookPen, Phone, Users } from "lucide-react";
import type { ActivityType } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Field, Input, Textarea } from "@/components/ui/form";
import { addDays, toDateTimeLocalIST } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { logLeadActivity } from "@/server/crm/actions";

const TYPES: { key: ActivityType; label: string; icon: typeof Phone; placeholder: string }[] = [
  { key: "call", label: "Call", icon: Phone, placeholder: "Discussed scope and budget…" },
  { key: "meeting", label: "Meeting", icon: Users, placeholder: "Who attended, what was agreed…" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, placeholder: "Shared the brochure…" },
  { key: "email", label: "Email", icon: Mail, placeholder: "Sent the proposal…" },
  { key: "visit", label: "Visit", icon: MapPin, placeholder: "Visited their office…" },
  { key: "note", label: "Note", icon: NotebookPen, placeholder: "Anything worth remembering…" },
];

const OUTCOMES = ["Interested", "Needs time", "Asked for proposal", "Negotiating", "No answer", "Not interested"];

/** Log an interaction. For open leads the next follow-up is required — no lead goes cold silently. */
export function ActivityComposer({ leadId, closed, today }: { leadId: string; closed: boolean; today: string }) {
  const [type, setType] = useState<ActivityType>("call");
  const [outcome, setOutcome] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [nowValue, setNowValue] = useState(() => toDateTimeLocalIST(new Date()));
  const quick = [
    { label: "Tomorrow", days: 1 },
    { label: "In 3 days", days: 3 },
    { label: "Next week", days: 7 },
    { label: "In 2 weeks", days: 14 },
  ];
  const t = TYPES.find((x) => x.key === type)!;

  return (
    <ActionForm
      action={logLeadActivity}
      onSuccess={() => {
        setOutcome("");
        setFollowUp("");
        setNowValue(toDateTimeLocalIST(new Date()));
      }}
      className="space-y-4"
    >
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="outcome" value={outcome} />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TYPES.map((x) => {
          const on = x.key === type;
          const Icon = x.icon;
          return (
            <button
              key={x.key}
              type="button"
              onClick={() => setType(x.key)}
              className={cn("relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition", on ? "text-white" : "bg-muted text-fg-muted hover:text-fg")}
            >
              {on ? <motion.span layoutId={`act-type-${leadId}`} className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,var(--brand),var(--brand-2))]" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
              <span className="relative inline-flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" /> {x.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <Input name="subject" placeholder={`${t.label} summary (optional)`} />
        <Input type="datetime-local" name="at" value={nowValue} onChange={(e) => setNowValue(e.target.value)} aria-label="When" />
      </div>
      <Textarea name="body" rows={3} placeholder={t.placeholder} />
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">Outcome</div>
        <div className="flex flex-wrap gap-1.5">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(outcome === o ? "" : o)}
              className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition", outcome === o ? "bg-brand-soft text-brand ring-brand/30" : "text-fg-muted ring-line hover:text-fg")}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
      <Field label="Next step">
        <Input name="nextStep" placeholder="e.g. Send revised quote with AMC" />
      </Field>
      {!closed ? (
        <div className="rounded-2xl border border-brand/20 bg-brand-soft/40 p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <CalendarPlus className="h-3.5 w-3.5" /> Next follow-up <span className="font-semibold normal-case tracking-normal text-fg-subtle">— required</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {quick.map((q) => {
              const v = `${addDays(today, q.days)}T10:00`;
              return (
                <button
                  key={q.days}
                  type="button"
                  onClick={() => setFollowUp(v)}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-bold transition", followUp === v ? "bg-brand text-white shadow" : "bg-solid text-fg-muted ring-1 ring-inset ring-line hover:text-fg")}
                >
                  {q.label}
                </button>
              );
            })}
            <Input type="datetime-local" name="nextFollowUp" value={followUp} onChange={(e) => setFollowUp(e.target.value)} required className="h-9 w-auto min-w-[200px] flex-1" aria-label="Next follow-up" />
          </div>
        </div>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton pendingText="Logging…">Log {t.label.toLowerCase()}</SubmitButton>
      </div>
    </ActionForm>
  );
}
