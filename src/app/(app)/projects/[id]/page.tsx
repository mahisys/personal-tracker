import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Building2, CalendarClock, Check, Clock, FileText, Flag, IndianRupee, KanbanSquare, NotebookPen, Plus, Timer, Trash2 } from "lucide-react";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getProjectDetail, getCompanyOptions } from "@/server/tasks/projects";
import { addMilestone, deleteMilestone, deleteProject, toggleMilestone } from "@/server/tasks/project-actions";
import { getProjectOptions, getRunningTimer, getTaskTypes } from "@/server/tasks/queries";
import { ActionButton, ActionForm, SubmitButton } from "@/components/client/action-form";
import { Attachments } from "@/components/shared/attachments";
import { History } from "@/components/shared/history";
import { WorkspaceBadge } from "@/components/shared/workspace-badge";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Section } from "@/components/ui/page";
import { Progress, ProgressRing } from "@/components/ui/stat";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { OverrunPrompt } from "@/components/tasks/overrun-prompt";
import { HealthBadge, etaLine } from "@/components/tasks/project-card";
import { EditProjectButton } from "@/components/tasks/project-form";
import { PROJECT_STATUS_META, STATUS_META } from "@/components/tasks/meta";
import { TaskBoard } from "@/components/tasks/task-board";
import { RunningTimerPill } from "@/components/tasks/timer";
import { cn } from "@/lib/cn";
import { formatDay, formatMinutes, relativeDay, todayIST } from "@/lib/dates";
import { formatINR, formatINRShort } from "@/lib/money";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Project" };
  const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, id));
  return { title: p?.name ?? "Project" };
}

const INVOICE_TONE = { draft: "neutral", sent: "info", part_paid: "warn", paid: "good", cancelled: "neutral" } as const;

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await getProjectDetail(id);
  if (!detail) notFound();
  const { card, project, milestones, tasks, timeByTask, invoices } = detail;
  const today = todayIST();
  const [companies, projectOptions, taskTypes, running] = await Promise.all([getCompanyOptions(), getProjectOptions(id), getTaskTypes(), getRunningTimer()]);

  const pct = card.totalTasks ? Math.round((card.doneTasks / card.totalTasks) * 100) : 0;
  const hours = card.minutesSpent / 60;
  const budgetPct = card.budgetHours ? Math.round((hours / card.budgetHours) * 100) : 0;
  const maxMinutes = Math.max(1, ...timeByTask.map((t) => t.m));
  const invoiced = invoices.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.totalPaise, 0);
  const collected = invoices.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.paidPaise, 0);
  const path = `/projects/${id}`;

  return (
    <>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted transition hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> All projects
      </Link>

      <div className="mb-6 flex flex-col gap-4 animate-fade-up sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <WorkspaceBadge ws={project.workspace} />
            <Badge tone={PROJECT_STATUS_META[project.status].tone}>{PROJECT_STATUS_META[project.status].label}</Badge>
            <HealthBadge p={card} today={today} />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg sm:text-[28px]">{project.name}</h1>
          {card.companyName ? (
            <Link href={`/crm/companies/${project.companyId}`} className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-brand">
              <Building2 className="h-4 w-4" /> {card.companyName}
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NewTaskButton projects={projectOptions} taskTypes={taskTypes} values={{ projectId: id, workspace: project.workspace }} label="Add task" />
          <EditProjectButton
            companies={companies}
            values={{
              id,
              name: project.name,
              description: project.description,
              workspace: project.workspace,
              status: project.status,
              companyId: project.companyId,
              startDate: project.startDate,
              deadline: project.deadline,
              budgetHours: project.budgetHours,
              valuePaise: project.valuePaise,
            }}
          />
          <ActionButton action={deleteProject} hidden={{ id }} variant="danger" size="md" confirm="Delete this project? Its tasks stay on your list." title="Delete project">
            <Trash2 className="h-4 w-4" />
          </ActionButton>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4 stagger">
        <Card className="flex items-center gap-4 p-5">
          <ProgressRing value={pct} size={64} stroke={7} />
          <div>
            <div className="text-xs font-semibold text-fg-muted">Tasks done</div>
            <div className="text-xl font-extrabold tabular-nums text-fg">
              {card.doneTasks}
              <span className="text-sm font-semibold text-fg-subtle">/{card.totalTasks}</span>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
            <Clock className="h-3.5 w-3.5" /> Hours
          </div>
          <div className="mt-1 text-xl font-extrabold tabular-nums text-fg">
            {formatMinutes(card.minutesSpent || 0)}
            {card.budgetHours ? <span className="text-sm font-semibold text-fg-subtle"> / {card.budgetHours}h</span> : null}
          </div>
          {card.budgetHours ? <Progress value={budgetPct} tone={budgetPct > 100 ? "bad" : budgetPct > 85 ? "warn" : "brand"} className="mt-2" /> : <div className="mt-1 text-xs text-fg-subtle">No budget set</div>}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
            <CalendarClock className="h-3.5 w-3.5" /> ETA
          </div>
          <div className={cn("mt-1 text-xl font-extrabold tabular-nums", card.eta?.health === "late" ? "text-rose-600 dark:text-rose-300" : "text-fg")}>
            {card.eta?.finishDate ? (card.eta.finishDate === today ? "Today" : formatDay(card.eta.finishDate, { short: true })) : card.openTasks ? "—" : "Clear"}
          </div>
          <div className="mt-0.5 truncate text-xs text-fg-subtle">{project.deadline ? `Deadline ${formatDay(project.deadline, { short: true })} (${relativeDay(project.deadline, today).toLowerCase()})` : etaLine(card, today)}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
            <IndianRupee className="h-3.5 w-3.5" /> Value
          </div>
          <div className="mt-1 text-xl font-extrabold tabular-nums text-fg">{card.valuePaise ? formatINRShort(card.valuePaise) : "—"}</div>
          <div className="mt-0.5 text-xs text-fg-subtle">{invoiced ? `${formatINRShort(invoiced)} invoiced · ${formatINRShort(collected)} in` : "Not invoiced yet"}</div>
        </Card>
      </div>

      <Section
        title="Board"
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-subtle">
            <KanbanSquare className="h-4 w-4" /> Drag cards or use ⇄ to move
          </span>
        }
      >
        {tasks.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="text-sm text-fg-muted">No tasks yet. Break the project into small, doable pieces.</p>
            <NewTaskButton projects={projectOptions} taskTypes={taskTypes} values={{ projectId: id, workspace: project.workspace }} label="Add the first task" variant="soft" />
          </Card>
        ) : (
          <TaskBoard tasks={tasks} today={today} showWorkspace={false} showProject={false} />
        )}
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Milestones" icon={<Flag className="h-4.5 w-4.5" />} description={milestones.length ? `${milestones.filter((m) => m.doneAt).length} of ${milestones.length} reached` : "Mark the big moments along the way"} />
            <CardBody className="space-y-2">
              {milestones.map((m) => {
                const late = !m.doneAt && m.dueDate && m.dueDate < today;
                return (
                  <div key={m.id} className={cn("group flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition-colors", m.doneAt ? "bg-emerald-500/5" : "bg-solid/50")}>
                    <ActionButton
                      action={toggleMilestone}
                      hidden={{ id: m.id }}
                      variant="ghost"
                      size="icon"
                      title={m.doneAt ? "Mark as not reached" : "Mark as reached"}
                      className={cn("h-7 w-7 rounded-full border-2 p-0", m.doneAt ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white" : "border-line-strong text-transparent hover:border-emerald-500 hover:text-emerald-500")}
                    >
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </ActionButton>
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-sm font-semibold text-fg", m.doneAt && "text-fg-subtle line-through")}>{m.name}</div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-fg-subtle">
                        {m.dueDate ? <span className={cn(late && "font-semibold text-rose-600 dark:text-rose-300")}>{late ? `Was due ${formatDay(m.dueDate, { short: true })}` : `Due ${formatDay(m.dueDate, { short: true })}`}</span> : null}
                        {m.total ? (
                          <span>
                            {m.done}/{m.total} tasks
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <ActionButton action={deleteMilestone} hidden={{ id: m.id }} variant="ghost" size="icon" confirm={`Remove milestone “${m.name}”?`} title="Remove milestone" className="opacity-60 group-hover:opacity-100">
                      <Trash2 className="h-4 w-4" />
                    </ActionButton>
                  </div>
                );
              })}
              <ActionForm action={addMilestone} className="flex flex-col gap-2 pt-1 sm:flex-row">
                <input type="hidden" name="projectId" value={id} />
                <Input name="name" placeholder="New milestone, e.g. Design sign-off" className="flex-1" />
                <Input type="date" name="dueDate" className="sm:w-44" aria-label="Milestone due date" />
                <SubmitButton variant="soft">
                  <Plus className="h-4 w-4" /> Add
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Time by task" icon={<Timer className="h-4.5 w-4.5" />} description={timeByTask.length ? `${formatMinutes(card.minutesSpent)} logged in total` : "Start a timer on any task to see where time goes"} />
            {timeByTask.length ? (
              <CardBody className="space-y-3">
                {timeByTask.map((t) => (
                  <Link key={t.taskId} href={`/tasks/${t.taskId}`} className="group block">
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_META[t.status].dot)} />
                        <span className="truncate font-semibold text-fg group-hover:text-brand">{t.title}</span>
                      </span>
                      <span className={cn("shrink-0 text-xs font-bold tabular-nums", t.estimate && t.m > t.estimate ? "text-amber-700 dark:text-amber-300" : "text-fg-muted")}>
                        {formatMinutes(t.m)}
                        {t.estimate ? ` / ${formatMinutes(t.estimate)}` : ""}
                      </span>
                    </div>
                    <Progress value={(t.m / maxMinutes) * 100} tone={t.estimate && t.m > t.estimate ? "warn" : "brand"} className="h-1.5" />
                  </Link>
                ))}
              </CardBody>
            ) : (
              <div className="h-4" />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Invoices"
              icon={<FileText className="h-4.5 w-4.5" />}
              description={invoices.length ? `${formatINR(invoiced, { whole: true })} billed · ${formatINR(collected, { whole: true })} collected` : "Bill this project when you're ready"}
              actions={
                <LinkButton href="/invoices/new" variant="soft" size="sm">
                  <Plus className="h-3.5 w-3.5" /> Invoice
                </LinkButton>
              }
            />
            <CardBody>
              {invoices.length ? (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {invoices.map((inv) => {
                    const overdue = inv.dueDate < today && !["paid", "cancelled", "draft"].includes(inv.status) && inv.totalPaise - inv.paidPaise > 0;
                    return (
                      <li key={inv.id}>
                        <Link href={`/invoices/${inv.id}`} className="flex items-center gap-3 bg-solid/50 px-3 py-2.5 transition hover:bg-brand-soft">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-fg">{inv.number}</div>
                            <div className="text-xs text-fg-subtle">
                              Issued {formatDay(inv.issueDate, { short: true })} · due {formatDay(inv.dueDate, { short: true })}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-extrabold tabular-nums text-fg">{formatINR(inv.totalPaise, { whole: true })}</div>
                            <Badge tone={overdue ? "bad" : INVOICE_TONE[inv.status]}>{overdue ? "Overdue" : inv.status.replace("_", " ")}</Badge>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-fg-subtle">No invoices linked to this project yet.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="About" icon={<NotebookPen className="h-4.5 w-4.5" />} />
            <CardBody className="space-y-3 text-sm">
              {project.description ? <p className="whitespace-pre-wrap leading-relaxed text-fg">{project.description}</p> : <p className="text-fg-subtle">No description yet.</p>}
              <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
                <div>
                  <dt className="font-semibold text-fg-subtle">Started</dt>
                  <dd className="font-bold text-fg">{formatDay(project.startDate)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-fg-subtle">Deadline</dt>
                  <dd className="font-bold text-fg">{formatDay(project.deadline)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
          <Attachments entityType="project" entityId={id} path={path} />
          <History entityType="project" entityId={id} />
        </div>
      </div>

      <OverrunPrompt />
      <RunningTimerPill timer={running} />
    </>
  );
}
