import { History, Play, Workflow } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getRecentRuns, getRulesForPage } from "@/server/automations/queries";
import { runAutomationsNow } from "@/server/automations/actions";
import { ActionButton } from "@/components/client/action-form";
import { EmptyState, PageHeader, Section } from "@/components/ui/page";
import { StatTile } from "@/components/ui/stat";
import { RuleCard } from "@/components/automations/rule-card";
import { RunHistory } from "@/components/automations/run-history";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  await requireUser();
  const [rules, runs] = await Promise.all([getRulesForPage(), getRecentRuns(30)]);
  const on = rules.filter((r) => r.enabled).length;
  const lastRun = runs[0];
  const today = runs.filter((r) => r.recent);
  const alerts24 = today.reduce((s, r) => s + r.alerts, 0);
  const tasks24 = today.reduce((s, r) => s + r.tasks, 0);

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Automations"
        description="Your quiet assistant. These run every 15 minutes, so reminders, chase tasks and briefings happen on their own."
        actions={
          <ActionButton action={runAutomationsNow} variant="primary" size="md">
            <Play className="h-4 w-4" /> Run all now
          </ActionButton>
        }
      />

      <div className="stagger mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Rules on" value={`${on}/${rules.length}`} icon={<Workflow className="h-5 w-5" />} tone="brand" sub={on === rules.length ? "Everything is switched on" : `${rules.length - on} paused`} />
        <StatTile
          label="Last run"
          value={lastRun ? lastRun.startedLabel.split(", ")[1] ?? lastRun.startedLabel : "—"}
          sub={lastRun ? (lastRun.ok === false ? "Something needs a look" : lastRun.startedLabel.split(",")[0]) : "Waiting for the first run"}
          icon={<History className="h-5 w-5" />}
          tone={lastRun?.ok === false ? "bad" : "good"}
        />
        <StatTile label="Alerts (24h)" value={alerts24} sub="raised by automations" tone="warn" />
        <StatTile label="Tasks (24h)" value={tasks24} sub="chase & follow-up tasks" tone="info" />
      </div>

      <Section title="Rules">
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rules.map((r) => (
            <RuleCard key={r.meta.key} data={r} />
          ))}
        </div>
      </Section>

      <Section title="Run history">
        {runs.length ? (
          <RunHistory runs={runs} />
        ) : (
          <EmptyState
            icon={<History className="h-6 w-6" />}
            title="No runs yet"
            description="Cloud Scheduler calls /api/cron/run every 15 minutes. You can also run everything right now."
            action={
              <ActionButton action={runAutomationsNow} variant="primary">
                <Play className="h-4 w-4" /> Run now
              </ActionButton>
            }
          />
        )}
      </Section>
    </>
  );
}
