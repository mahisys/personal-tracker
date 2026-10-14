import { count, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { Aurora } from "@/components/shell/aurora";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { PushRegistrar } from "@/components/shell/push-registrar";
import { publicFirebaseConfig } from "@/server/firebase-admin";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const [ws, [{ unread }]] = await Promise.all([
    getWorkspaceFilter(),
    db.select({ unread: count() }).from(notifications).where(isNull(notifications.readAt)),
  ]);
  return (
    <div className="relative flex min-h-dvh">
      <Aurora />
      <Sidebar badges={{ "/notifications": unread }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar ws={ws ?? "all"} unread={unread} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>
      <MobileNav />
      <PushRegistrar config={publicFirebaseConfig()} />
    </div>
  );
}
