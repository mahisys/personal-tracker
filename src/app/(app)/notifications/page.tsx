import { count, desc, isNull } from "drizzle-orm";
import { BellRing, CheckCheck, Coffee } from "lucide-react";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { markAllNotificationsRead } from "@/server/automations/actions";
import { ActionButton } from "@/components/client/action-form";
import { EmptyState, PageHeader, SubNav } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";
import { formatDay, formatDateTime, todayIST, toISTDate, toISTTime, addDays } from "@/lib/dates";
import { NotificationList, type AlertGroup } from "./notification-list";

export const metadata = { title: "Alerts" };

function timeLabel(d: Date): string {
  const [h, m] = toISTTime(d).split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireUser();
  const { filter } = await searchParams;
  const unreadOnly = filter === "unread";
  const [rows, [{ unread }], [{ total }]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(unreadOnly ? isNull(notifications.readAt) : undefined)
      .orderBy(desc(notifications.createdAt))
      .limit(200),
    db.select({ unread: count() }).from(notifications).where(isNull(notifications.readAt)),
    db.select({ total: count() }).from(notifications),
  ]);

  const today = todayIST();
  const yesterday = addDays(today, -1);
  const groups: AlertGroup[] = [];
  for (const n of rows) {
    const day = toISTDate(n.createdAt);
    const label = day === today ? "Today" : day === yesterday ? "Yesterday" : formatDay(day, { short: true });
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) {
      g = { label, items: [] };
      groups.push(g);
    }
    g.items.push({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      workspace: n.workspace,
      time: day === today || day === yesterday ? timeLabel(n.createdAt) : formatDateTime(n.createdAt),
      read: n.readAt != null,
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Alerts"
        description={unread ? `${unread} new — tap one to jump straight to it.` : "You're all caught up."}
        actions={
          unread ? (
            <ActionButton action={markAllNotificationsRead} variant="secondary" size="md">
              <CheckCheck className="h-4 w-4" /> Mark all read
            </ActionButton>
          ) : null
        }
      />
      <SubNav
        active={unreadOnly ? "/notifications?filter=unread" : "/notifications"}
        items={[
          { href: "/notifications", label: "All", count: total },
          { href: "/notifications?filter=unread", label: "Unread", count: unread },
        ]}
      />
      {groups.length ? (
        <NotificationList groups={groups} />
      ) : (
        <EmptyState
          icon={unreadOnly ? <Coffee className="h-6 w-6" /> : <BellRing className="h-6 w-6" />}
          title="Nothing needs you right now"
          description={
            unreadOnly
              ? "Every alert has been seen. Enjoy the calm — we'll tap you on the shoulder when something comes up."
              : "Reminders for bills, follow-ups, overdue invoices and DSA files will appear here as they come up."
          }
          action={
            unreadOnly ? (
              <LinkButton href="/notifications" variant="secondary">
                See all alerts
              </LinkButton>
            ) : (
              <LinkButton href="/automations" variant="soft">
                See automations
              </LinkButton>
            )
          }
        />
      )}
    </>
  );
}
