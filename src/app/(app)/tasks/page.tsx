import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarCheck2, CheckSquare, Flame, Hourglass, SearchX } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getWorkspaceFilter } from "@/server/workspace";
import { getAccuracy, getEta, getProjectOptions, getRunningTimer, getTaskTypes, listOpenTasks, listRecentlyDone } from "@/server/tasks/queries";
import { resolveLinkLabels, isLinkedType } from "@/server/tasks/links";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskList } from "@/components/tasks/task-list";
import { TaskBoard } from "@/components/tasks/task-board";
import { EstimateInsight } from "@/components/tasks/insight-card";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { OverrunPrompt } from "@/components/tasks/overrun-prompt";
import { RunningTimerPill } from "@/components/tasks/timer";
import type { TaskFormValues } from "@/components/tasks/task-form";
import { formatDay, todayIST } from "@/lib/dates";
import { WORKSPACE_META } from "@/lib/workspaces";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Tasks" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
const UUID = /^[0-9a-f-]{36}$/i;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const ws = await getWorkspaceFilter();
  const today = todayIST();
  const view = one(sp.view) === "board" ? "board" : "list";
  const projectParam = one(sp.project);
  const priorityParam = Number(one(sp.priority));
  const filters = {
    ws,
    projectId: projectParam && UUID.test(projectParam) ? projectParam : null,
    priority: priorityParam >= 1 && priorityParam <= 4 ? priorityParam : null,
    linked: one(sp.linked) === "1",
    q: one(sp.q),
  };

  const [eta, projects, taskTypes, accuracy, running] = await Promise.all([getEta(), getProjectOptions(), getTaskTypes(), getAccuracy(), getRunningTimer()]);
  const [open, done] = await Promise.all([listOpenTasks(filters, eta), listRecentlyDone(filters, view === "board" ? 7 : 14)]);

  // Prefill for /tasks?new=1&linkedType=lead&linkedId=…&projectId=…&due=YYYY-MM-DD (used by other modules)
  const prefill: TaskFormValues = { workspace: ws ?? undefined };
  const lt = one(sp.linkedType);
  const lid = one(sp.linkedId);
  if (isLinkedType(lt) && lid && UUID.test(lid)) {
    const labels = await resolveLinkLabels([{ type: lt, id: lid }]);
    Object.assign(prefill, { linkedType: lt, linkedId: lid, linkedLabel: labels.get(`${lt}:${lid}`) ?? null });
  }
  const pid = one(sp.projectId);
  if (pid && UUID.test(pid)) prefill.projectId = pid;
  const due = one(sp.due);
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) prefill.dueDate = due;
  const title = one(sp.title);
  if (title) prefill.title = title.slice(0, 300);

  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const dueToday = open.filter((t) => t.dueDate === today).length;
  const filtered = !!(filters.projectId || filters.priority || filters.linked || filters.q);
  const openForBoard = [...open, ...done];

  const description =
    open.length === 0
      ? "A clear list. Add something when you're ready."
      : [`${open.length} open`, dueToday ? `${dueToday} due today` : null, overdue ? `${overdue} overdue` : null].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        eyebrow={ws ? `Focus · ${WORKSPACE_META[ws].name}` : "Focus"}
        title="Tasks"
        description={description}
        actions={<NewTaskButton key={one(sp.new) === "1" ? "open" : "closed"} projects={projects} taskTypes={taskTypes} values={prefill} defaultOpen={one(sp.new) === "1"} />}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 stagger">
        <MiniStat icon={<Flame className="h-4 w-4" />} label="Overdue" value={overdue} tone={overdue ? "bad" : "good"} sub={overdue ? "Tackle or snooze these first" : "Nothing overdue"} />
        <MiniStat icon={<CalendarCheck2 className="h-4 w-4" />} label="Due today" value={dueToday} tone={dueToday ? "warn" : "good"} sub={dueToday ? "You've got this" : "Free day ahead"} />
        <MiniStat
          icon={<Hourglass className="h-4 w-4" />}
          label="Queue clears"
          value={eta.queueFinishDate ? (eta.queueFinishDate === today ? "Today" : formatDay(eta.queueFinishDate, { short: true })) : "—"}
          tone="brand"
          sub={eta.skipped.length ? `${eta.skipped.length} task${eta.skipped.length === 1 ? "" : "s"} without an estimate` : "Based on your daily hours"}
        />
        <EstimateInsight accuracy={accuracy} />
      </div>

      <Suspense>
        <TaskFilters projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      </Suspense>

      {open.length === 0 && (view === "list" || done.length === 0) ? (
        filtered ? (
          <EmptyState icon={<SearchX className="h-6 w-6" />} title="No tasks match these filters" description="Try clearing a filter or searching for something else." />
        ) : (
          <EmptyState
            icon={<CheckSquare className="h-6 w-6" />}
            title={done.length ? "All done — what a run! 🎉" : "No tasks yet — add your first one"}
            description={done.length ? `You finished ${done.length} task${done.length === 1 ? "" : "s"} recently. Take a breath.` : "Write down the next small step. Future you will say thanks."}
            action={<NewTaskButton projects={projects} taskTypes={taskTypes} values={prefill} label="Add a task" />}
          />
        )
      ) : view === "board" ? (
        <TaskBoard tasks={openForBoard} today={today} showWorkspace={!ws} />
      ) : (
        <TaskList tasks={open} done={done} today={today} showWorkspace={!ws} />
      )}

      <OverrunPrompt />
      <RunningTimerPill timer={running} />
    </>
  );
}

function MiniStat({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; tone: "bad" | "warn" | "good" | "brand" }) {
  const t = {
    bad: "bg-rose-500/12 text-rose-600 dark:text-rose-300",
    warn: "bg-amber-500/14 text-amber-600 dark:text-amber-300",
    good: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
    brand: "bg-brand-soft text-brand",
  }[tone];
  return (
    <div className="glass flex items-center gap-3 rounded-[var(--radius-card)] border border-line p-4 shadow-card">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", t)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-fg-muted">{label}</div>
        <div className="text-xl font-extrabold tabular-nums text-fg">{value}</div>
        <div className="truncate text-xs text-fg-subtle">{sub}</div>
      </div>
    </div>
  );
}
