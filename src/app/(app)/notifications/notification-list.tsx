"use client";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  Bell,
  CalendarSync,
  ClipboardCheck,
  Copy,
  FileWarning,
  Hourglass,
  Landmark,
  Phone,
  Receipt,
  Repeat,
  Sunrise,
  Trash2,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { WorkspaceKey } from "@/db/schema";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { ActionButton } from "@/components/client/action-form";
import { cn } from "@/lib/cn";
import { deleteNotification, markNotificationRead } from "@/server/automations/actions";

export type AlertItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  workspace: WorkspaceKey | null;
  time: string;
  read: boolean;
};

export type AlertGroup = { label: string; items: AlertItem[] };

const KIND: Record<string, { icon: LucideIcon; tone: string }> = {
  digest: { icon: Sunrise, tone: "text-brand bg-brand-soft" },
  weekly_review: { icon: ClipboardCheck, tone: "text-fuchsia-600 bg-fuchsia-500/12 dark:text-fuchsia-300" },
  bill_due: { icon: Receipt, tone: "text-amber-600 bg-amber-500/14 dark:text-amber-300" },
  bill_overdue: { icon: Receipt, tone: "text-rose-600 bg-rose-500/12 dark:text-rose-300" },
  lead_followup: { icon: Phone, tone: "text-sky-600 bg-sky-500/12 dark:text-sky-300" },
  stale_lead: { icon: Hourglass, tone: "text-amber-600 bg-amber-500/14 dark:text-amber-300" },
  invoice_overdue: { icon: FileWarning, tone: "text-rose-600 bg-rose-500/12 dark:text-rose-300" },
  dsa_stale: { icon: Landmark, tone: "text-amber-600 bg-amber-500/14 dark:text-amber-300" },
  payout_chase: { icon: Wallet, tone: "text-amber-600 bg-amber-500/14 dark:text-amber-300" },
  cash_warning: { icon: WalletCards, tone: "text-rose-600 bg-rose-500/12 dark:text-rose-300" },
  renewal: { icon: CalendarSync, tone: "text-sky-600 bg-sky-500/12 dark:text-sky-300" },
  recurring: { icon: Repeat, tone: "text-emerald-600 bg-emerald-500/12 dark:text-emerald-300" },
};
const FALLBACK = { icon: Bell, tone: "text-brand bg-brand-soft" };

/** Pulls the ready-to-send message out of an overdue-invoice alert. */
function suggestedMessage(body: string): string | null {
  const m = body.match(/“([\s\S]+)”/);
  return m ? m[1] : null;
}

export function NotificationList({ groups }: { groups: AlertGroup[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [readIds, markRead] = useOptimistic<Set<string>, string>(new Set(), (s, id) => new Set(s).add(id));

  const open = (a: AlertItem) => {
    start(async () => {
      if (!a.read) {
        markRead(a.id);
        await markNotificationRead(a.id);
      }
      if (a.link) router.push(a.link);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.label}>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-fg-subtle">{g.label}</h2>
          <ul className="stagger space-y-2.5">
            <AnimatePresence initial={false}>
              {g.items.map((a) => {
                const k = KIND[a.kind] ?? FALLBACK;
                const Icon = k.icon;
                const unread = !a.read && !readIds.has(a.id);
                const msg = a.kind === "invoice_overdue" ? suggestedMessage(a.body) : null;
                const body = msg ? a.body.replace(/\s*Suggested message: “[\s\S]+”/, "") : a.body;
                return (
                  <motion.li key={a.id} layout exit={{ opacity: 0, x: -24, height: 0 }} transition={{ duration: 0.2 }}>
                    <div
                      className={cn(
                        "group relative flex gap-3 rounded-2xl border p-4 transition-all duration-300",
                        unread
                          ? "glass border-brand/30 shadow-[0_0_0_1px_var(--brand-soft),0_10px_30px_-12px_var(--brand)]"
                          : "border-line bg-solid/40 hover:bg-solid/70",
                      )}
                    >
                      {unread ? <span className="absolute -left-1 top-5 h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_10px_var(--brand)]" aria-label="Unread" /> : null}
                      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", k.tone)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <button type="button" onClick={() => open(a)} className="min-w-0 flex-1 text-left focus-visible:outline-none">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={cn("text-sm text-fg", unread ? "font-bold" : "font-semibold")}>{a.title}</span>
                          {a.workspace ? <WorkspaceBadge ws={a.workspace} /> : null}
                        </div>
                        {body ? <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm text-fg-muted">{body}</p> : null}
                        <div className="mt-1.5 text-xs font-medium text-fg-subtle">{a.time}</div>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
                        {msg ? (
                          <button
                            type="button"
                            title="Copy reminder message"
                            aria-label="Copy reminder message"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(msg);
                                toast.success("Reminder copied — paste it into WhatsApp or email");
                              } catch {
                                toast.error("Couldn't copy — select the text instead");
                              }
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-brand-soft hover:text-brand"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        ) : null}
                        <div className="opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <ActionButton action={deleteNotification} hidden={{ id: a.id }} variant="ghost" size="icon" title="Remove alert">
                            <Trash2 className="h-4 w-4" />
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  );
}
