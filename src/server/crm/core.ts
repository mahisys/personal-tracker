import "server-only";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { activities, activityLog, companies, contacts, invoices, leadStages, leads, projects, quotes, type ActivityType, type WorkspaceKey } from "@/db/schema";
import { logActivity } from "@/server/activity";
import type { AppSettings } from "@/server/settings";
import { invoiceFromQuote } from "@/server/sales/quote-core";
import { ACTIVITY_LABEL } from "./pipeline";

export class CrmError extends Error {}

export type MoveOutcome = {
  stage: typeof leadStages.$inferSelect;
  won: boolean;
  lost: boolean;
  invoice: { id: string; number: string } | null;
  project: { id: string; name: string } | null;
};

/**
 * Moves a lead into a stage. Entering a stage sets the stage's default probability.
 * Won: sets closedAt and creates a project (+ a draft invoice from the accepted/latest quote, if any).
 * Lost: requires a reason. Back to open: clears closedAt and the lost reason.
 * Call inside a transaction.
 */
export async function moveLeadToStage(
  conn: DbOrTx,
  leadId: string,
  stageId: string,
  opts: { lostReason?: string | null; settings: AppSettings },
): Promise<MoveOutcome> {
  const [lead] = await conn.select().from(leads).where(eq(leads.id, leadId)).for("update");
  if (!lead) throw new CrmError("Lead not found");
  const [stage] = await conn.select().from(leadStages).where(eq(leadStages.id, stageId));
  if (!stage) throw new CrmError("Stage not found");
  const [from] = await conn.select().from(leadStages).where(eq(leadStages.id, lead.stageId));
  const result: MoveOutcome = { stage, won: false, lost: false, invoice: null, project: null };
  if (lead.stageId === stage.id) return result;

  if (stage.kind === "lost" && !opts.lostReason?.trim()) throw new CrmError("Tell us why it was lost — it helps next time");

  const now = new Date();
  await conn
    .update(leads)
    .set({
      stageId: stage.id,
      probability: stage.probability,
      closedAt: stage.kind === "open" ? null : now,
      lostReason: stage.kind === "lost" ? opts.lostReason!.trim() : null,
      nextFollowUpAt: stage.kind === "open" ? lead.nextFollowUpAt : null,
    })
    .where(eq(leads.id, lead.id));
  await logActivity(
    "lead",
    lead.id,
    "stage",
    `Moved from ${from?.name ?? "—"} to ${stage.name}${stage.kind === "lost" ? ` — ${opts.lostReason!.trim()}` : ""}`,
    { from: from?.id, to: stage.id },
    conn,
  );

  if (stage.kind === "lost") result.lost = true;
  if (stage.kind === "won" && from?.kind !== "won") {
    result.won = true;
    // Never create duplicates if the lead was won before (e.g. moved back and forth).
    const [existingProject] = await conn
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .innerJoin(activityLog, and(eq(activityLog.entityType, "project"), eq(activityLog.entityId, projects.id)))
      .where(and(eq(activityLog.action, "created"), sql`${activityLog.details}->>'leadId' = ${lead.id}`))
      .limit(1);
    const project =
      existingProject ??
      (
        await conn
          .insert(projects)
          .values({
            workspace: "mahisys",
            name: lead.title,
            description: lead.notes,
            companyId: lead.companyId,
            status: "active",
            valuePaise: lead.valuePaise || null,
            startDate: null,
          })
          .returning({ id: projects.id, name: projects.name })
      )[0];
    if (!existingProject) await logActivity("project", project.id, "created", `Created from won lead "${lead.title}"`, { leadId: lead.id }, conn);
    result.project = project;

    const leadQuotes = await conn
      .select()
      .from(quotes)
      .where(eq(quotes.leadId, lead.id))
      .orderBy(desc(quotes.createdAt));
    const quote = leadQuotes.find((q) => q.status === "accepted") ?? leadQuotes[0];
    if (quote) {
      if (quote.invoiceId) {
        const [inv] = await conn.select({ id: invoices.id, number: invoices.number }).from(invoices).where(eq(invoices.id, quote.invoiceId));
        result.invoice = inv ?? null;
      }
      if (!result.invoice) {
        const inv = await invoiceFromQuote(conn, quote, opts.settings, { projectId: project.id, leadId: lead.id });
        result.invoice = { id: inv.id, number: inv.number };
      }
    }
    await logActivity(
      "lead",
      lead.id,
      "won",
      `Won 🎉 — project${result.invoice ? ` and draft invoice ${result.invoice.number}` : ""} created`,
      { projectId: project.id, invoiceId: result.invoice?.id ?? null },
      conn,
    );
  }
  return result;
}

export type ActivityInput = {
  leadId: string;
  type: ActivityType;
  subject?: string | null;
  body?: string | null;
  outcome?: string | null;
  nextStep?: string | null;
  at?: Date | null;
  nextFollowUpAt?: Date | null;
};

/** Logs a call/meeting/etc. against a lead, bumps lastActivityAt and sets the next follow-up. */
export async function logLeadActivityCore(conn: DbOrTx, a: ActivityInput) {
  const [lead] = await conn.select().from(leads).where(eq(leads.id, a.leadId));
  if (!lead) throw new CrmError("Lead not found");
  const [stage] = await conn.select().from(leadStages).where(eq(leadStages.id, lead.stageId));
  const closed = stage?.kind !== "open";
  if (!closed && !a.nextFollowUpAt) throw new CrmError("When will you follow up next? Pick a date to keep this lead warm");
  const at = a.at ?? new Date();
  const label = ACTIVITY_LABEL[a.type] ?? a.type;
  const [row] = await conn
    .insert(activities)
    .values({
      workspace: lead.workspace,
      type: a.type,
      subject: a.subject?.trim() || label,
      body: a.body ?? "",
      outcome: a.outcome ?? null,
      nextStep: a.nextStep ?? null,
      at,
      leadId: lead.id,
      contactId: lead.contactId,
      companyId: lead.companyId,
    })
    .returning();
  const lastActivityAt = !lead.lastActivityAt || at > lead.lastActivityAt ? at : lead.lastActivityAt;
  await conn
    .update(leads)
    .set({ lastActivityAt, nextFollowUpAt: closed ? lead.nextFollowUpAt : a.nextFollowUpAt })
    .where(eq(leads.id, lead.id));
  await logActivity("lead", lead.id, "activity", `${label} logged${a.outcome ? ` — ${a.outcome}` : ""}`, { activityId: row.id }, conn);
  return row;
}

/** Finds a contact/company by name in a workspace (case-insensitive), or creates it. */
export async function findOrCreateCompany(conn: DbOrTx, workspace: WorkspaceKey, name: string | null) {
  if (!name) return null;
  const [found] = await conn
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.workspace, workspace), ilike(companies.name, name.replace(/[\\%_]/g, (c) => `\\${c}`))))
    .limit(1);
  if (found) return found.id;
  const [row] = await conn.insert(companies).values({ workspace, name }).returning({ id: companies.id });
  await logActivity("company", row.id, "created", `Company added`, null, conn);
  return row.id;
}

export async function findOrCreateContact(
  conn: DbOrTx,
  workspace: WorkspaceKey,
  name: string | null,
  extra: { companyId: string | null; phone?: string | null; email?: string | null; source?: string | null },
) {
  if (!name) return null;
  const [found] = await conn
    .select({ id: contacts.id, companyId: contacts.companyId })
    .from(contacts)
    .where(and(eq(contacts.workspace, workspace), ilike(contacts.name, name.replace(/[\\%_]/g, (c) => `\\${c}`))))
    .limit(1);
  if (found) {
    if (!found.companyId && extra.companyId) await conn.update(contacts).set({ companyId: extra.companyId }).where(eq(contacts.id, found.id));
    return found.id;
  }
  const [row] = await conn
    .insert(contacts)
    .values({ workspace, name, companyId: extra.companyId, phone: extra.phone ?? null, whatsapp: extra.phone ?? null, email: extra.email ?? null, source: extra.source ?? null })
    .returning({ id: contacts.id });
  await logActivity("contact", row.id, "created", `Contact added`, null, conn);
  return row.id;
}

/** Stages for a workspace; falls back to MahiSys stages when a workspace has none of its own. */
export async function stagesFor(conn: DbOrTx, ws: WorkspaceKey) {
  const own = await conn.select().from(leadStages).where(eq(leadStages.workspace, ws)).orderBy(leadStages.sort);
  if (own.length || ws === "mahisys") return { stages: own, workspace: ws };
  const fallback = await conn.select().from(leadStages).where(eq(leadStages.workspace, "mahisys")).orderBy(leadStages.sort);
  return { stages: fallback, workspace: "mahisys" as WorkspaceKey };
}
