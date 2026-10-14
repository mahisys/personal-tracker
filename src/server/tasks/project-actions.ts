"use server";
import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { companies, milestones, PROJECT_STATUSES, projects, type ProjectStatus } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import { parseWorkspace } from "@/server/workspace";
import { day, done, fail, str, type ActionResult } from "@/lib/action";
import { formatDay } from "@/lib/dates";
import { formatINR, parseRupeesToPaise } from "@/lib/money";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | null | undefined): v is string => !!v && UUID.test(v);

function revalidateProject(id?: string | null) {
  revalidatePath("/projects");
  revalidatePath("/tasks");
  revalidatePath("/");
  if (id) revalidatePath(`/projects/${id}`);
}

export async function saveProject(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return fail("Give the project a name");
  const statusRaw = str(form, "status") ?? "active";
  if (!(PROJECT_STATUSES as readonly string[]).includes(statusRaw)) return fail("Pick a status");
  const status = statusRaw as ProjectStatus;
  const startDate = day(form, "startDate");
  const deadline = day(form, "deadline");
  if (startDate && deadline && deadline < startDate) return fail("The deadline is before the start date");

  const budgetRaw = str(form, "budgetHours");
  const budgetHours = budgetRaw == null ? null : Number(budgetRaw);
  if (budgetHours != null && (!Number.isFinite(budgetHours) || budgetHours < 0 || budgetHours > 100000)) return fail("Budget hours should be a number like 40 or 12.5");

  const valueRaw = str(form, "value");
  const valuePaise = parseRupeesToPaise(valueRaw);
  if (valueRaw && valuePaise == null) return fail("Enter the value in rupees, like 1,50,000");
  if (valuePaise != null && valuePaise < 0) return fail("Project value can't be negative");

  const companyId = str(form, "companyId");
  if (companyId) {
    if (!isUuid(companyId)) return fail("Pick a valid client");
    const [c] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId));
    if (!c) return fail("That client no longer exists");
  }

  const values = {
    name,
    description: str(form, "description") ?? "",
    workspace: parseWorkspace(form.get("workspace")),
    status,
    startDate,
    deadline,
    budgetHours: budgetHours == null ? null : Math.round(budgetHours * 100) / 100,
    valuePaise,
    companyId: companyId || null,
  };

  if (id) {
    if (!isUuid(id)) return fail("Project not found");
    const [before] = await db.select().from(projects).where(eq(projects.id, id));
    if (!before) return fail("Project not found");
    await db.update(projects).set(values).where(eq(projects.id, id));
    const changes: string[] = [];
    if (before.name !== values.name) changes.push("name");
    if (before.status !== values.status) changes.push(`status → ${values.status.replace("_", " ")}`);
    if (before.deadline !== values.deadline) changes.push(values.deadline ? `deadline → ${formatDay(values.deadline)}` : "deadline removed");
    if (before.budgetHours !== values.budgetHours) changes.push(`budget → ${values.budgetHours ?? "none"}h`);
    if (before.valuePaise !== values.valuePaise) changes.push(`value → ${formatINR(values.valuePaise)}`);
    if (before.companyId !== values.companyId) changes.push("client");
    if (before.description !== values.description) changes.push("description");
    if (changes.length) await logActivity("project", id, "updated", `Updated ${changes.join(", ")}`);
    revalidateProject(id);
    const finished = values.status === "done" && before.status !== "done";
    return done(finished ? "Project complete — congratulations!" : "Project saved", finished ? { celebrate: true } : {});
  }
  const [row] = await db.insert(projects).values(values).returning();
  await logActivity("project", row.id, "created", "Project created");
  revalidateProject();
  return done("Project created — let's make it happen", { redirectTo: `/projects/${row.id}` });
}

export async function deleteProject(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!isUuid(id)) return fail("Project not found");
  // Tasks keep living without the project (FK is "set null"); milestones cascade.
  const [row] = await db.delete(projects).where(eq(projects.id, id)).returning();
  if (!row) return fail("Project not found");
  revalidateProject();
  return done(`Deleted “${row.name}”. Its tasks are still on your list.`, { redirectTo: "/projects" });
}

export async function addMilestone(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const projectId = str(form, "projectId");
  const name = str(form, "name");
  if (!isUuid(projectId)) return fail("Project not found");
  if (!name) return fail("Name the milestone");
  const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!p) return fail("Project not found");
  const [{ m }] = await db.select({ m: max(milestones.sort) }).from(milestones).where(eq(milestones.projectId, projectId));
  await db.insert(milestones).values({ projectId, name, dueDate: day(form, "dueDate"), sort: (m ?? 0) + 1 });
  await logActivity("project", projectId, "milestone_added", `Milestone “${name}” added`);
  revalidateProject(projectId);
  return done("Milestone added");
}

export async function toggleMilestone(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!isUuid(id)) return fail("Milestone not found");
  const [m] = await db.select().from(milestones).where(eq(milestones.id, id));
  if (!m) return fail("Milestone not found");
  const nowDone = !m.doneAt;
  await db.update(milestones).set({ doneAt: nowDone ? new Date() : null }).where(eq(milestones.id, id));
  await logActivity("project", m.projectId, nowDone ? "milestone_done" : "milestone_reopened", nowDone ? `Milestone “${m.name}” reached` : `Milestone “${m.name}” re-opened`);
  revalidateProject(m.projectId);
  return nowDone ? done(`Milestone reached: ${m.name}`, { celebrate: true }) : done("Milestone re-opened");
}

export async function deleteMilestone(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!isUuid(id)) return fail("Milestone not found");
  const [m] = await db.delete(milestones).where(and(eq(milestones.id, id))).returning();
  if (!m) return fail("Milestone not found");
  await logActivity("project", m.projectId, "milestone_removed", `Milestone “${m.name}” removed`);
  revalidateProject(m.projectId);
  return done("Milestone removed");
}
