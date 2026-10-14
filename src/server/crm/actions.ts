"use server";
import { asc, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { ACTIVITY_TYPES, STAGE_KINDS, companies, contacts, leadStages, leads, tasks, type ActivityType, type StageKind } from "@/db/schema";
import { day, done, fail, int, str, type ActionResult } from "@/lib/action";
import { fromDateTimeLocalIST, istToInstant, todayIST } from "@/lib/dates";
import { isValidGstin, stateCodeFromGstin } from "@/lib/gst";
import { formatINR, parseRupeesToPaise } from "@/lib/money";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { parseWorkspace } from "@/server/workspace";
import { logActivity } from "@/server/activity";
import { CrmError, findOrCreateCompany, findOrCreateContact, logLeadActivityCore, moveLeadToStage, stagesFor } from "./core";
import { followUpInDays } from "./pipeline";

export type MoveResult = NonNullable<Exclude<ActionResult, void>> & {
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  projectId?: string | null;
};

function revalidateCrm(leadId?: string) {
  revalidatePath("/crm");
  if (leadId) revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/sales");
  revalidatePath("/");
}

/** Accepts either a datetime-local value ("2026-10-15T10:00") or a plain day (10:00 IST). */
function readFollowUp(form: FormData, key: string): Date | null {
  const v = str(form, key);
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return istToInstant(v, "10:00");
  return fromDateTimeLocalIST(v);
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export async function saveLead(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const title = str(form, "title");
  if (!title) return fail("Give the lead a short title, e.g. “Website revamp — Sharma Traders”");
  const workspace = parseWorkspace(str(form, "workspace"));
  const valueInput = str(form, "value");
  const valuePaise = valueInput ? parseRupeesToPaise(valueInput) : 0;
  if (valuePaise == null || valuePaise < 0) return fail("Enter the deal value in rupees");
  const companyName = str(form, "companyName");
  const contactName = str(form, "contactName");
  const fields = {
    title,
    workspace,
    valuePaise,
    expectedCloseDate: day(form, "expectedCloseDate"),
    source: str(form, "source"),
    notes: str(form, "notes") ?? "",
  };

  if (id) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    if (!lead) return fail("Lead not found");
    const prob = int(form, "probability");
    if (prob != null && (prob < 0 || prob > 100)) return fail("Probability is a percentage between 0 and 100");
    await db.transaction(async (tx) => {
      const companyId = await findOrCreateCompany(tx, workspace, companyName);
      const contactId = await findOrCreateContact(tx, workspace, contactName, { companyId, phone: str(form, "phone"), email: str(form, "email"), source: fields.source });
      await tx
        .update(leads)
        .set({ ...fields, companyId, contactId, probability: prob ?? lead.probability, nextFollowUpAt: form.has("nextFollowUp") ? readFollowUp(form, "nextFollowUp") : lead.nextFollowUpAt })
        .where(eq(leads.id, id));
      await logActivity("lead", id, "updated", "Lead details updated", null, tx);
    });
    revalidateCrm(id);
    return done("Lead updated");
  }

  const { stages } = await stagesFor(db, workspace);
  const chosen = str(form, "stageId");
  const stage = stages.find((s) => s.id === chosen) ?? stages.find((s) => s.kind === "open");
  if (!stage) return fail("Add a pipeline stage first (CRM → Stages)");
  const row = await db.transaction(async (tx) => {
    const companyId = await findOrCreateCompany(tx, workspace, companyName);
    const contactId = await findOrCreateContact(tx, workspace, contactName, { companyId, phone: str(form, "phone"), email: str(form, "email"), source: fields.source });
    const [r] = await tx
      .insert(leads)
      .values({
        ...fields,
        companyId,
        contactId,
        stageId: stage.id,
        probability: stage.probability,
        nextFollowUpAt: readFollowUp(form, "nextFollowUp") ?? followUpInDays(1, todayIST()),
        closedAt: stage.kind === "open" ? null : new Date(),
      })
      .returning();
    await logActivity("lead", r.id, "created", `Lead created in ${stage.name}${valuePaise ? ` — ${formatINR(valuePaise)}` : ""}`, null, tx);
    return r;
  });
  revalidateCrm(row.id);
  return done("Lead added — good luck with this one!", { redirectTo: str(form, "redirect") === "detail" ? `/crm/leads/${row.id}` : undefined });
}

export async function moveLead(_: ActionResult, form: FormData): Promise<MoveResult> {
  await requireUser();
  const id = str(form, "id");
  const stageId = str(form, "stageId");
  if (!id || !stageId) return { ok: false, error: "Choose a stage" };
  const settings = await getSettings();
  try {
    const r = await db.transaction((tx) => moveLeadToStage(tx, id, stageId, { lostReason: str(form, "lostReason"), settings }));
    revalidateCrm(id);
    revalidatePath("/projects");
    revalidatePath("/invoices");
    if (r.won) {
      return {
        ok: true,
        celebrate: true,
        message: r.invoice ? `Won! 🎉 Project and draft invoice ${r.invoice.number} are ready` : "Won! 🎉 A project has been set up for it",
        invoiceId: r.invoice?.id ?? null,
        invoiceNumber: r.invoice?.number ?? null,
        projectId: r.project?.id ?? null,
      };
    }
    if (r.lost) return { ok: true, message: "Marked as lost — onwards to the next one" };
    return { ok: true, message: `Moved to ${r.stage.name}` };
  } catch (e) {
    if (e instanceof CrmError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function setLeadFollowUp(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Lead not found");
  const days = int(form, "days");
  const at = days != null ? followUpInDays(days, todayIST()) : readFollowUp(form, "nextFollowUp");
  if (!at && !form.has("clear")) return fail("Pick a follow-up date");
  await db.update(leads).set({ nextFollowUpAt: at }).where(eq(leads.id, id));
  await logActivity("lead", id, "followup", at ? `Next follow-up set` : "Follow-up cleared");
  revalidateCrm(id);
  return done(at ? "Follow-up scheduled" : "Follow-up cleared");
}

export async function logLeadActivity(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const leadId = str(form, "leadId");
  const type = str(form, "type") as ActivityType | null;
  if (!leadId) return fail("Lead not found");
  if (!type || !ACTIVITY_TYPES.includes(type)) return fail("What kind of activity was it?");
  try {
    await db.transaction((tx) =>
      logLeadActivityCore(tx, {
        leadId,
        type,
        subject: str(form, "subject"),
        body: str(form, "body"),
        outcome: str(form, "outcome"),
        nextStep: str(form, "nextStep"),
        at: fromDateTimeLocalIST(str(form, "at")),
        nextFollowUpAt: readFollowUp(form, "nextFollowUp"),
      }),
    );
  } catch (e) {
    if (e instanceof CrmError) return fail(e.message);
    throw e;
  }
  revalidateCrm(leadId);
  return done("Logged — nice work staying in touch");
}

export async function addLeadTask(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const leadId = str(form, "leadId");
  const title = str(form, "title");
  if (!leadId) return fail("Lead not found");
  if (!title) return fail("What needs doing?");
  const [t] = await db
    .insert(tasks)
    .values({ workspace: "mahisys", title, dueDate: day(form, "dueDate"), priority: int(form, "priority") ?? 2, linkedType: "lead", linkedId: leadId, taskType: "sales" })
    .returning();
  await logActivity("task", t.id, "created", "Task created from a lead");
  await logActivity("lead", leadId, "task", `Task added: ${title}`);
  revalidateCrm(leadId);
  revalidatePath("/tasks");
  return done("Task added");
}

export async function deleteLead(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Lead not found");
  await db.delete(leads).where(eq(leads.id, id));
  revalidateCrm();
  return done("Lead deleted", { redirectTo: "/crm" });
}

// ---------------------------------------------------------------------------
// Contacts & companies
// ---------------------------------------------------------------------------

export async function saveContact(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return fail("Add the contact's name");
  const workspace = parseWorkspace(str(form, "workspace"));
  const email = str(form, "email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("That email address doesn't look right");
  const values = {
    name,
    workspace,
    phone: str(form, "phone"),
    whatsapp: str(form, "whatsapp"),
    email,
    role: str(form, "role"),
    city: str(form, "city"),
    source: str(form, "source"),
    notes: str(form, "notes") ?? "",
  };
  const r = await db.transaction(async (tx) => {
    const companyId = (await findOrCreateCompany(tx, workspace, str(form, "companyName"))) ?? null;
    if (id) {
      await tx.update(contacts).set({ ...values, companyId }).where(eq(contacts.id, id));
      await logActivity("contact", id, "updated", "Contact details updated", null, tx);
      return { id, created: false };
    }
    const [row] = await tx.insert(contacts).values({ ...values, companyId }).returning({ id: contacts.id });
    await logActivity("contact", row.id, "created", "Contact added", null, tx);
    return { id: row.id, created: true };
  });
  revalidatePath("/crm/contacts");
  revalidatePath(`/crm/contacts/${r.id}`);
  return done(r.created ? `${name} added` : "Contact saved", { redirectTo: r.created && str(form, "redirect") === "detail" ? `/crm/contacts/${r.id}` : undefined });
}

export async function deleteContact(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Contact not found");
  await db.delete(contacts).where(eq(contacts.id, id));
  revalidatePath("/crm/contacts");
  return done("Contact deleted", { redirectTo: "/crm/contacts" });
}

export async function saveCompany(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return fail("Add the company name");
  const gstin = str(form, "gstin")?.toUpperCase().replace(/\s/g, "") ?? null;
  if (gstin && !isValidGstin(gstin)) return fail("That GSTIN doesn't look right — it's 15 characters, like 27ABCDE1234F1Z5");
  const email = str(form, "email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("That email address doesn't look right");
  const values = {
    name,
    workspace: parseWorkspace(str(form, "workspace")),
    gstin,
    stateCode: (gstin ? stateCodeFromGstin(gstin) : null) ?? str(form, "stateCode"),
    industry: str(form, "industry"),
    phone: str(form, "phone"),
    email,
    website: str(form, "website"),
    address: str(form, "address") ?? "",
    city: str(form, "city"),
    notes: str(form, "notes") ?? "",
  };
  let newId = id;
  if (id) {
    await db.update(companies).set(values).where(eq(companies.id, id));
    await logActivity("company", id, "updated", "Company details updated");
  } else {
    const [row] = await db.insert(companies).values(values).returning({ id: companies.id });
    newId = row.id;
    await logActivity("company", row.id, "created", "Company added");
  }
  revalidatePath("/crm/companies");
  revalidatePath(`/crm/companies/${newId}`);
  return done(id ? "Company saved" : `${name} added`, { redirectTo: !id && str(form, "redirect") === "detail" ? `/crm/companies/${newId}` : undefined });
}

export async function deleteCompany(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Company not found");
  await db.delete(companies).where(eq(companies.id, id));
  revalidatePath("/crm/companies");
  return done("Company deleted", { redirectTo: "/crm/companies" });
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export async function saveStage(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return fail("Stage name can't be empty");
  const probability = int(form, "probability") ?? 0;
  if (probability < 0 || probability > 100) return fail("Probability is between 0 and 100");
  const kind = (str(form, "kind") ?? "open") as StageKind;
  if (!STAGE_KINDS.includes(kind)) return fail("Pick open, won or lost");
  if (id) {
    await db.update(leadStages).set({ name, probability, kind }).where(eq(leadStages.id, id));
  } else {
    const workspace = parseWorkspace(str(form, "workspace"));
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${leadStages.sort}), -1)::int` }).from(leadStages).where(eq(leadStages.workspace, workspace));
    await db.insert(leadStages).values({ workspace, name, probability, kind, sort: max + 1 });
  }
  revalidatePath("/crm/stages");
  revalidatePath("/crm");
  return done(id ? "Stage saved" : "Stage added");
}

export async function moveStage(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  const dir = str(form, "dir");
  const [stage] = id ? await db.select().from(leadStages).where(eq(leadStages.id, id)) : [];
  if (!stage) return fail("Stage not found");
  const all = await db.select().from(leadStages).where(eq(leadStages.workspace, stage.workspace)).orderBy(asc(leadStages.sort));
  const i = all.findIndex((s) => s.id === stage.id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return done();
  [all[i], all[j]] = [all[j], all[i]];
  await db.transaction(async (tx) => {
    for (const [k, s] of all.entries()) await tx.update(leadStages).set({ sort: k }).where(eq(leadStages.id, s.id));
  });
  revalidatePath("/crm/stages");
  revalidatePath("/crm");
  return done();
}

export async function deleteStage(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = str(form, "id");
  if (!id) return fail("Stage not found");
  const [{ n }] = await db.select({ n: count() }).from(leads).where(eq(leads.stageId, id));
  if (n > 0) return fail(`${n} lead${n === 1 ? " is" : "s are"} in this stage — move them first`);
  await db.delete(leadStages).where(eq(leadStages.id, id));
  revalidatePath("/crm/stages");
  revalidatePath("/crm");
  return done("Stage removed");
}
