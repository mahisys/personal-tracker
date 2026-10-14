import { Crosshair, Gauge } from "lucide-react";
import { getWorkspaceFilter } from "@/server/workspace";
import { getEstimateAccuracy } from "@/server/reports/queries";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { StatTile } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { EstimateChart } from "@/components/reports/charts";
import { formatMinutes } from "@/lib/dates";

const VERDICT = {
  spot_on: { label: "Spot on", tone: "good" as const },
  under: { label: "Takes longer", tone: "bad" as const },
  over: { label: "Faster than planned", tone: "info" as const },
};

export default async function EstimatesReportPage() {
  const ws = await getWorkspaceFilter();
  const { lines, overall } = await getEstimateAccuracy(ws);

  if (!overall) {
    return (
      <EmptyState
        icon={<Crosshair className="h-6 w-6" />}
        title="Not enough data yet"
        description="Add an estimate and a type to tasks, track time with the timer, and finish them. We'll show how close your guesses are."
        action={<LinkButton href="/tasks">Go to tasks</LinkButton>}
      />
    );
  }

  const tip =
    overall.verdict === "under"
      ? `Things take about ${overall.ratio}× your estimate. Padding plans by ${Math.round((overall.ratio - 1) * 100)}% will make ETAs honest.`
      : overall.verdict === "over"
        ? "You finish faster than you plan — you could take on a little more."
        : "Your estimates are impressively accurate. Keep it up!";

  return (
    <div className="space-y-6">
      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Overall" value={`${overall.ratio}×`} sub="actual ÷ estimate (1× = perfect)" icon={<Gauge className="h-5 w-5" />} tone={VERDICT[overall.verdict].tone === "bad" ? "warn" : "good"} />
        <StatTile label="Tasks measured" value={overall.tasks} sub="done, last 6 months" tone="brand" />
        <StatTile label="Estimated vs actual" value={formatMinutes(overall.actualMinutes)} sub={`planned ${formatMinutes(overall.estimateMinutes)}`} tone="info" />
      </div>

      <Card>
        <CardHeader title="By task type" description={tip} />
        <CardBody>
          <EstimateChart data={lines.map((l) => ({ taskType: l.taskType, ratio: l.ratio, tasks: l.tasks }))} />
        </CardBody>
      </Card>

      <TableWrap>
        <Table className="min-w-[560px]">
          <THead>
            <tr>
              <TH>Task type</TH>
              <TH className="text-right">Tasks</TH>
              <TH className="text-right">Estimated</TH>
              <TH className="text-right">Actual</TH>
              <TH className="text-right">Ratio</TH>
              <TH>Verdict</TH>
            </tr>
          </THead>
          <tbody>
            {lines.map((l) => (
              <TR key={l.taskType}>
                <TD className="font-semibold capitalize">{l.taskType}</TD>
                <TD className="text-right tabular-nums">{l.tasks}</TD>
                <TD className="text-right tabular-nums">{formatMinutes(l.estimateMinutes)}</TD>
                <TD className="text-right tabular-nums">{formatMinutes(l.actualMinutes)}</TD>
                <TD className="text-right font-bold tabular-nums">{l.ratio}×</TD>
                <TD>
                  <Badge tone={VERDICT[l.verdict].tone}>{VERDICT[l.verdict].label}</Badge>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
