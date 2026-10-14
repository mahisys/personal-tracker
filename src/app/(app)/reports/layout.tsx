import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/ui/page";
import { ReportNav } from "@/components/reports/report-nav";

export const metadata = { title: "Reports" };

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <PageHeader eyebrow="Insights" title="Reports" description="The whole business at a glance — profit, spending, money owed to you, GST and where your time goes." />
      <ReportNav />
      <Suspense fallback={<div className="skeleton h-96 rounded-[var(--radius-card)]" />}>{children}</Suspense>
    </>
  );
}
