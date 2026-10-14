import Link from "next/link";
import { Mail, MapPin, MessageCircle, NotebookPen, Phone, Users, type LucideIcon } from "lucide-react";
import type { activities, StageKind } from "@/db/schema";
import { Badge, type Tone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/server/invoices/reminder";
import { ACTIVITY_LABEL } from "@/server/crm/pipeline";

export const ACTIVITY_ICON: Record<string, LucideIcon> = { call: Phone, meeting: Users, email: Mail, whatsapp: MessageCircle, visit: MapPin, note: NotebookPen };
const ACTIVITY_TINT: Record<string, string> = {
  call: "bg-sky-500/12 text-sky-600 dark:text-sky-300",
  meeting: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
  email: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300",
  whatsapp: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
  visit: "bg-amber-500/14 text-amber-600 dark:text-amber-300",
  note: "bg-muted text-fg-muted",
};

/** tel: / WhatsApp / mailto: quick buttons. */
export function ContactButtons({ phone, whatsapp, email, size = "sm" }: { phone?: string | null; whatsapp?: string | null; email?: string | null; size?: "sm" | "md" }) {
  const wa = whatsappLink(whatsapp || phone);
  if (!phone && !wa && !email) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {phone ? (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={buttonClass("secondary", size)}>
          <Phone className="h-3.5 w-3.5" /> Call
        </a>
      ) : null}
      {wa ? (
        <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("success", size)}>
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className={buttonClass("soft", size)}>
          <Mail className="h-3.5 w-3.5" /> Email
        </a>
      ) : null}
    </div>
  );
}

type Activity = typeof activities.$inferSelect;

/** Vertical timeline of CRM interactions. */
export function ActivityTimeline({ items, showLead, leadTitles }: { items: Activity[]; showLead?: boolean; leadTitles?: Map<string, string> }) {
  if (items.length === 0) return <p className="text-sm text-fg-subtle">No interactions logged yet.</p>;
  return (
    <ol className="stagger relative space-y-5 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-line-strong">
      {items.map((a) => {
        const Icon = ACTIVITY_ICON[a.type] ?? NotebookPen;
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className={cn("relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-bg", ACTIVITY_TINT[a.type])}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-bold text-fg">{a.subject || ACTIVITY_LABEL[a.type]}</span>
                {a.outcome ? <Badge tone="brand">{a.outcome}</Badge> : null}
                <span className="text-xs text-fg-subtle">{formatDateTime(a.at)}</span>
              </div>
              {showLead && a.leadId ? (
                <Link href={`/crm/leads/${a.leadId}`} className="text-xs font-semibold text-brand hover:underline">
                  {leadTitles?.get(a.leadId) ?? "View lead"}
                </Link>
              ) : null}
              {a.body ? <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">{a.body}</p> : null}
              {a.nextStep ? (
                <p className="mt-1.5 inline-flex rounded-lg bg-muted px-2 py-1 text-xs text-fg-muted">
                  <span className="mr-1 font-bold text-fg">Next:</span> {a.nextStep}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function StageBadge({ name, kind }: { name: string; kind: StageKind }) {
  const tone: Tone = kind === "won" ? "good" : kind === "lost" ? "bad" : "brand";
  return <Badge tone={tone}>{name}</Badge>;
}
