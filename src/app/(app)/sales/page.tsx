import Link from "next/link";
import { CalendarCheck2, FileSignature, Gauge, Goal, Hourglass, Percent, Sparkles, Target, TrendingUp } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { getSalesDashboard } from "@/server/sales/queries";
import { saveSalesTarget } from "@/server/sales/actions";
import { percentOf } from "@/server/sales/metrics";
import { PageHeader, SubNav } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProgressRing, StatTile } from "@/components/ui/stat";
import { LinkButton } from "@/components/ui/button";
import { Field, FormGrid, Input, MoneyInput } from "@/components/ui/form";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Modal, ModalActions } from "@/components/client/modal";
import { AnimatedNumber } from "@/components/client/animated-number";
import { PipelineBars, RevenueChart } from "@/components/sales/charts";
import { formatMonth, diffDays, todayIST } from "@/lib/dates";
import { formatINR, formatINRShort, paiseToInput } from "@/lib/money";
import { WORKSPACE_META } from "@/lib/workspaces";

export const metadata = { title: "Sales" };

export default async function SalesPage() {
  await requireUser();
  const filter = await getWorkspaceFilter();
  const d = await getSalesDashboard(filter);
  const today = todayIST();
  const targetPaise = d.target?.targetPaise ?? 0;
  const pct = percentOf(d.revenueThisMonth, targetPaise);
  const daysLeft = diffDays(today, d.monthEnd) + 1;
  const toGo = Math.max(0, targetPaise - d.revenueThisMonth);

  const targetModal = (
    <Modal
      trigger={
        <>
          <Goal className="h-4 w-4" /> {d.target ? "Edit target" : "Set target"}
        </>
      }
      variant={d.target ? "secondary" : "primary"}
      title="Monthly sales target"
      description={`${WORKSPACE_META[d.ws].name} · invoiced value incl. GST`}
    >
      <ActionForm action={saveSalesTarget}>
        <input type="hidden" name="workspace" value={d.ws} />
        <FormGrid>
          <Field label="Month">
            <Input type="month" name="month" defaultValue={d.month} required />
          </Field>
          <Field label="Target" hint="Set 0 to clear">
            <MoneyInput name="target" defaultValue={paiseToInput(d.target?.targetPaise)} placeholder="5,00,000" required autoFocus />
          </Field>
        </FormGrid>
        {d.targets.length ? (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Recent targets</div>
            <ul className="space-y-1 text-sm">
              {d.targets.slice(0, 6).map((t) => (
                <li key={t.id} className="flex justify-between rounded-lg bg-muted/60 px-3 py-1.5">
                  <span className="text-fg-muted">{formatMonth(t.month)}</span>
                  <span className="font-semibold tabular-nums text-fg">{formatINR(t.targetPaise, { whole: true })}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ModalActions>
          <SubmitButton>Save target</SubmitButton>
        </ModalActions>
      </ActionForm>
    </Modal>
  );

  return (
    <>
      <PageHeader
        eyebrow={WORKSPACE_META[d.ws].name}
        title="Sales"
        description="How this month is tracking, what's in the pipe and where your wins come from."
        actions={
          <>
            {targetModal}
            <LinkButton href="/sales/quotes?new=1" variant="soft">
              <FileSignature className="h-4 w-4" /> New quote
            </LinkButton>
          </>
        }
      />
      <SubNav active="/sales" items={[{ href: "/sales", label: "Dashboard" }, { href: "/sales/quotes", label: "Quotes" }]} />

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card className="relative overflow-hidden animate-fade-up">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,var(--brand-soft),transparent_70%)]" />
          <CardBody className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <ProgressRing value={pct} size={148} stroke={14} label={targetPaise ? `${pct}%` : "—"} sub={targetPaise ? "of target" : "no target"} />
            <div className="min-w-0 text-center sm:text-left">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">Revenue · {formatMonth(d.month)}</div>
              <div className="mt-1 text-4xl font-extrabold tracking-tight text-fg">
                <AnimatedNumber value={d.revenueThisMonth} format="inr" />
              </div>
              {targetPaise ? (
                <p className="mt-2 text-sm text-fg-muted">
                  {pct >= 100 ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-300">
                      <Sparkles className="h-4 w-4" /> Target smashed — {formatINRShort(d.revenueThisMonth - targetPaise)} over!
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold text-fg">{formatINRShort(toGo)}</span> to go of {formatINRShort(targetPaise)} · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                    </>
                  )}
                </p>
              ) : (
                <p className="mt-2 text-sm text-fg-muted">Set a monthly target to see your progress ring fill up.</p>
              )}
              <p className="mt-1 text-xs text-fg-subtle">Invoices issued this month, excluding drafts and cancelled.</p>
            </div>
          </CardBody>
        </Card>
        <div className="stagger grid grid-cols-2 gap-3">
          <StatTile label="Weighted forecast" value={formatINRShort(d.weighted)} sub={`of ${formatINRShort(d.pipelineValue)} open`} icon={<Gauge className="h-5 w-5" />} tone="violet" href="/crm" />
          <StatTile label="Win rate · 90 days" value={d.winRate == null ? "—" : `${d.winRate}%`} sub={`${d.won90} won · ${d.lost90} lost`} icon={<Percent className="h-5 w-5" />} tone={d.winRate != null && d.winRate >= 50 ? "good" : "brand"} />
          <StatTile label="Avg. days to close" value={d.avgDaysToClose == null ? "—" : `${d.avgDaysToClose}d`} sub="Created → won" icon={<Hourglass className="h-5 w-5" />} tone="info" />
          <StatTile label="Open leads" value={d.openCount} sub="in the pipeline" icon={<Target className="h-5 w-5" />} tone="brand" href="/crm" />
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="animate-fade-up">
          <CardHeader title="Revenue, last 12 months" icon={<TrendingUp className="h-4.5 w-4.5" />} description="Invoiced vs collected (incl. TDS)" />
          <CardBody>
            <RevenueChart data={d.chart} />
          </CardBody>
        </Card>
        <Card className="animate-fade-up">
          <CardHeader title="Pipeline by stage" icon={<CalendarCheck2 className="h-4.5 w-4.5" />} description={`${formatINRShort(d.pipelineValue)} open · ${formatINRShort(d.weighted)} weighted`} />
          <CardBody>
            {d.byStage.some((s) => s.count > 0) ? (
              <PipelineBars data={d.byStage} />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-fg-subtle">
                No open leads yet.
                <Link href="/crm?new=1" className="font-semibold text-brand hover:underline">
                  Add your first lead
                </Link>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-fg-muted">Lead sources</h2>
      {d.sources.length === 0 ? (
        <p className="text-sm text-fg-subtle">Add a source to your leads (referral, website, LinkedIn…) to see what brings in the business.</p>
      ) : (
        <TableWrap>
          <Table className="min-w-[520px]">
            <THead>
              <tr>
                <TH>Source</TH>
                <TH className="text-right">Leads</TH>
                <TH className="text-right">Won</TH>
                <TH className="text-right">Conversion</TH>
                <TH className="text-right">Won value</TH>
                <TH className="text-right">Open pipeline</TH>
              </tr>
            </THead>
            <tbody className="stagger">
              {d.sources.map((s) => (
                <TR key={s.source}>
                  <TD className="font-semibold">{s.source}</TD>
                  <TD className="text-right tabular-nums">{s.leads}</TD>
                  <TD className="text-right tabular-nums">{s.won}</TD>
                  <TD className="text-right tabular-nums text-fg-muted">{s.leads ? `${Math.round((s.won / s.leads) * 100)}%` : "—"}</TD>
                  <TD className="text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatINRShort(s.wonValue)}</TD>
                  <TD className="text-right tabular-nums text-fg-muted">{formatINRShort(s.pipeline)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
