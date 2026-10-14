import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AlarmClock, ArrowLeft, Bell, CalendarDays, Clock, FolderKanban, ListChecks, NotebookPen, Repeat, Tag, Timer, Trash2, TrendingUp } from "lucide-react";
import { db } from "@/db";
import { milestones, projects, tasks } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { addTimeEntry, deleteTask, deleteTimeEntry } from "@/server/tasks/actions";
import { getEta, getProjectOptions, getRunningTimer, getSubtasks, getTask, getTaskTypes, getTimeEntries } from "@/server/tasks/queries";
import { resolveLinkLabels } from "@/server/tasks/links";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Attachments } from "@/components/shared/attachments";
import { History } from "@/components/shared/history";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Progress } from "@/components/ui/stat";
import { EditTaskButton } from "@/components/tasks/edit-task-button";
import { LinkChip } from "@/components/tasks/link-chip";
import { PRIORITY_META, STATUS_META } from "@/components/tasks/meta";
import { OverrunPrompt } from "@/components/tasks/overrun-prompt";
import { Subtasks } from "@/components/tasks/subtasks";
import { formatTime12 } from "@/components/tasks/task-bits";
import { TaskCheck } from "@/components/tasks/task-check";
import { SnoozeButton } from "@/components/tasks/snooze-button";
import { RunningTimerPill, TimerControl } from "@/components/tasks/timer";
import { cn } from "@/lib/cn";
import { formatDateTime, formatDay, formatMinutes, relativeDay, todayIST } from "@/lib/dates";
import { describeRecurrence } from "@/lib/recurrence";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Task" };
  const t = await getTask(id);
  return { title: t?.title ?? "Task" };
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const task = await getTask(id);
  if (!task) notFound();

  const today = todayIST();
  const [subtasks, entries, eta, running, projectOptions, taskTypes, labels, project, milestone, parent] = await Promise.all([
    getSubtasks(id),
    getTimeEntries(id),
    getEta(),
    getRunningTimer(),
    getProjectOptions(task.projectId),
    getTaskTypes(),
    resolveLinkLabels([{ type: task.linkedType, id: task.linkedId }]),
    task.projectId ? db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, task.projectId)).then((r) => r[0] ?? null) : null,
    task.milestoneId ? db.select({ name: milestones.name }).from(milestones).where(eq(milestones.id, task.milestoneId)).then((r) => r[0] ?? null) : null,
    task.parentTaskId ? db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.id, task.parentTaskId)).then((r) => r[0] ?? null) : null,
  ]);

  const logged = entries.reduce((s, e) => s + (e.endedAt ? e.minutes : 0), 0);
  const isDone = task.status === "done";
  const linkedLabel = task.linkedType && task.linkedId ? labels.get(`${task.linkedType}:${task.linkedId}`) ?? null : null;
  const taskEta = eta.tasks[id];
  const pct = task.estimateMinutes ? Math.round((logged / task.estimateMinutes) * 100) : 0;
  const overdue = !isDone && task.dueDate != null && task.dueDate < today;
  const path = `/tasks/${id}`;

  return (
    <>
      <Link
        href={parent ? `/tasks/${parent.id}` : project ? `/projects/${project.id}` : "/tasks"}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted transition hover:text-brand"
      >
        <ArrowLeft className="h-4 w-4" /> {parent ? parent.title : project ? project.name : "All tasks"}
      </Link>

      <div className="mb-6 flex flex-col gap-4 animate-fade-up sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="pt-1">
            <TaskCheck id={id} done={isDone} priority={task.priority} size="lg" />
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <WorkspaceBadge ws={task.workspace} />
              <Badge tone={STATUS_META[task.status].tone} dot>
                {STATUS_META[task.status].label}
              </Badge>
              <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-extrabold", PRIORITY_META[task.priority]?.className)}>{PRIORITY_META[task.priority]?.label}</span>
            </div>
            <h1 className={cn("text-2xl font-extrabold tracking-tight text-fg sm:text-[28px]", isDone && "text-fg-subtle line-through decoration-emerald-500/50")}>{task.title}</h1>
            {isDone && task.completedAt ? <p className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-300">Completed {formatDateTime(task.completedAt)} — well done.</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!isDone && task.dueDate && task.dueDate <= today ? <SnoozeButton id={id} className="h-10 rounded-xl border border-line-strong bg-solid px-3" /> : null}
          <EditTaskButton
            projects={projectOptions}
            taskTypes={taskTypes}
            values={{
              id: task.id,
              title: task.title,
              description: task.description,
              workspace: task.workspace,
              projectId: task.projectId,
              milestoneId: task.milestoneId,
              parentTaskId: task.parentTaskId,
              status: task.status,
              priority: task.priority,
              taskType: task.taskType,
              dueDate: task.dueDate,
              dueTime: task.dueTime,
              remindAt: task.remindAt?.toISOString() ?? null,
              estimateMinutes: task.estimateMinutes,
              recurrence: task.recurrence,
              linkedType: task.linkedType,
              linkedId: task.linkedId,
              linkedLabel,
              tags: task.tags,
            }}
          />
          <ActionButton
            action={deleteTask}
            hidden={{ id, redirectTo: parent ? `/tasks/${parent.id}` : project ? `/projects/${project.id}` : "/tasks" }}
            variant="danger"
            size="md"
            confirm={subtasks.length ? `Delete this task and its ${subtasks.length} steps?` : "Delete this task?"}
            title="Delete task"
          >
            <Trash2 className="h-4 w-4" />
          </ActionButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="animate-fade-up">
            <CardBody className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
              <Fact icon={<CalendarDays className="h-4 w-4" />} label="Due">
                {task.dueDate ? (
                  <span className={cn(overdue && "text-rose-600 dark:text-rose-300")}>
                    {relativeDay(task.dueDate, today)}
                    <span className="block text-xs font-medium text-fg-subtle">
                      {formatDay(task.dueDate)}
                      {task.dueTime ? ` · ${formatTime12(task.dueTime)}` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="text-fg-subtle">No date</span>
                )}
              </Fact>
              <Fact icon={<Clock className="h-4 w-4" />} label="Time">
                {formatMinutes(logged || 0)}
                <span className="block text-xs font-medium text-fg-subtle">{task.estimateMinutes ? `of ${formatMinutes(task.estimateMinutes)} planned` : "No estimate"}</span>
              </Fact>
              <Fact icon={<TrendingUp className="h-4 w-4" />} label="ETA">
                {isDone ? (
                  <span className="text-emerald-600 dark:text-emerald-300">Done</span>
                ) : taskEta ? (
                  <span className={cn(taskEta.late && "text-rose-600 dark:text-rose-300")}>
                    {taskEta.finishDate === today ? "Today" : formatDay(taskEta.finishDate, { short: true })}
                    <span className="block text-xs font-medium text-fg-subtle">{taskEta.late ? "After the due date" : "In your queue"}</span>
                  </span>
                ) : (
                  <span className="text-fg-subtle">Add an estimate</span>
                )}
              </Fact>
              {project ? (
                <Fact icon={<FolderKanban className="h-4 w-4" />} label="Project">
                  <Link href={`/projects/${project.id}`} className="hover:text-brand">
                    {project.name}
                  </Link>
                  {milestone ? <span className="block text-xs font-medium text-fg-subtle">{milestone.name}</span> : null}
                </Fact>
              ) : null}
              {task.recurrence ? (
                <Fact icon={<Repeat className="h-4 w-4" />} label="Repeats">
                  {describeRecurrence(task.recurrence)}
                  {task.recurrence.until ? <span className="block text-xs font-medium text-fg-subtle">until {formatDay(task.recurrence.until)}</span> : null}
                </Fact>
              ) : null}
              {task.remindAt ? (
                <Fact icon={<Bell className="h-4 w-4" />} label="Reminder">
                  {formatDateTime(task.remindAt)}
                </Fact>
              ) : null}
              {task.taskType ? (
                <Fact icon={<Tag className="h-4 w-4" />} label="Type">
                  <span className="capitalize">{task.taskType}</span>
                </Fact>
              ) : null}
            </CardBody>
            {task.estimateMinutes ? (
              <div className="px-5 pb-5">
                <Progress value={pct} tone={pct > 100 ? "warn" : pct >= 100 ? "good" : "brand"} />
                <div className="mt-1.5 text-xs text-fg-subtle">
                  {pct > 100 ? `${pct - 100}% over the estimate — that's useful to know` : `${pct}% of the estimate used`}
                </div>
              </div>
            ) : null}
            {(task.linkedType && task.linkedId) || task.tags.length ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
                {task.linkedType && task.linkedId ? <LinkChip type={task.linkedType} id={task.linkedId} label={linkedLabel} className="text-xs" /> : null}
                {task.tags.map((t) => (
                  <Badge key={t} tone="violet">
                    #{t}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Card>

          <Card className="animate-fade-up">
            <CardHeader title="Notes" icon={<NotebookPen className="h-4.5 w-4.5" />} />
            <CardBody>
              {task.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{task.description}</p>
              ) : (
                <p className="text-sm text-fg-subtle">No notes yet. Use Edit to jot down context or the first small step.</p>
              )}
            </CardBody>
          </Card>

          {!task.parentTaskId ? (
            <Card className="animate-fade-up">
              <CardHeader title="Steps" icon={<ListChecks className="h-4.5 w-4.5" />} description={subtasks.length ? undefined : "Big task? Break it down — each tick feels good."} />
              <CardBody>
                <Subtasks parentId={id} items={subtasks} />
              </CardBody>
            </Card>
          ) : null}

          <Card className="animate-fade-up">
            <CardHeader title="Time log" icon={<Timer className="h-4.5 w-4.5" />} description={entries.length ? `${formatMinutes(logged)} across ${entries.length} entr${entries.length === 1 ? "y" : "ies"}` : "Start the timer or add time by hand"} />
            <CardBody className="space-y-4">
              {entries.length > 0 ? (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {entries.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 bg-solid/50 px-3 py-2.5">
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", e.endedAt ? "bg-brand-soft text-brand" : "bg-emerald-500/12 text-emerald-600")}>
                        {e.endedAt ? <Clock className="h-4 w-4" /> : <AlarmClock className="h-4 w-4 animate-pulse" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-fg">{e.endedAt ? formatMinutes(e.minutes) : "Running now"}</div>
                        <div className="truncate text-xs text-fg-subtle">
                          {formatDateTime(e.startedAt)}
                          {e.note ? ` · ${e.note}` : ""}
                        </div>
                      </div>
                      {e.endedAt ? (
                        <ActionButton action={deleteTimeEntry} hidden={{ id: e.id }} variant="ghost" size="icon" confirm="Remove this time entry?" title="Remove entry">
                          <Trash2 className="h-4 w-4" />
                        </ActionButton>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <ActionForm action={addTimeEntry} className="flex flex-col gap-2 rounded-xl border border-dashed border-line-strong p-3 sm:flex-row sm:items-end">
                <input type="hidden" name="taskId" value={id} />
                <label className="flex flex-col gap-1 text-xs font-semibold text-fg-muted">
                  Date
                  <Input type="date" name="date" defaultValue={today} max={today} className="sm:w-40" />
                </label>
                <div className="flex items-end gap-1.5">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-fg-muted">
                    Hours
                    <Input type="number" name="timeH" min={0} max={24} inputMode="numeric" placeholder="0" className="w-16 px-2 text-center" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-fg-muted">
                    Min
                    <Input type="number" name="timeM" min={0} max={59} step={5} inputMode="numeric" placeholder="30" className="w-16 px-2 text-center" />
                  </label>
                </div>
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-fg-muted">
                  Note
                  <Input name="note" placeholder="What did you work on?" />
                </label>
                <SubmitButton variant="soft" className="sm:self-end">
                  Log time
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          {!isDone ? <TimerControl taskId={id} running={running} loggedMinutes={logged} /> : null}
          <Attachments entityType="task" entityId={id} path={path} />
          <History entityType="task" entityId={id} />
        </div>
      </div>

      <OverrunPrompt />
      <RunningTimerPill timer={running} />
    </>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
        {icon}
        {label}
      </div>
      <div className="text-sm font-bold text-fg">{children}</div>
    </div>
  );
}
