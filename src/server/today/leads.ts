import "server-only";
import { and, eq, isNull, lt, lte, or, gte } from "drizzle-orm";
import { db } from "@/db";
import { companies, contacts, leads, leadStages, type WorkspaceKey } from "@/db/schema";
import { addDays, diffDays, istToInstant, toISTDate } from "@/lib/dates";
import { formatINRShort } from "@/lib/money";
import type { ComingUpItem, NeedsItem } from "./types";

/** Open leads with a follow-up due by the end of today, or with no follow-up planned at all. */
export async function leadsNeedingYou(ws: WorkspaceKey | null, today: string): Promise<NeedsItem[]> {
  const endOfToday = istToInstant(addDays(today, 1));
  const rows = await db
    .select({
      id: leads.id,
      title: leads.title,
      workspace: leads.workspace,
      next: leads.nextFollowUpAt,
      value: leads.valuePaise,
      stage: leadStages.name,
      company: companies.name,
      contact: contacts.name,
      phone: contacts.phone,
      whatsapp: contacts.whatsapp,
    })
    .from(leads)
    .innerJoin(leadStages, eq(leadStages.id, leads.stageId))
    .leftJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(leadStages.kind, "open"), or(lt(leads.nextFollowUpAt, endOfToday), isNull(leads.nextFollowUpAt)), ws ? eq(leads.workspace, ws) : undefined))
    .orderBy(leads.nextFollowUpAt)
    .limit(100);
  return rows.map((r) => {
    const day = r.next ? toISTDate(r.next) : null;
    const late = day ? diffDays(day, today) : 0;
    const when = !day ? "No follow-up planned" : late > 0 ? `Follow-up was ${late === 1 ? "yesterday" : `${late} days ago`}` : "Follow up today";
    return {
      key: `lead:${r.id}`,
      kind: "lead" as const,
      id: r.id,
      title: r.title,
      context: [when, r.company ?? r.contact, r.stage, r.value ? formatINRShort(r.value) : null].filter(Boolean).join(" · "),
      workspace: r.workspace,
      href: `/crm/leads/${r.id}`,
      date: day,
      overdue: !!day && day < today,
      amountPaise: r.value,
      phone: r.phone ?? r.whatsapp,
    };
  });
}

export async function leadsComingUp(ws: WorkspaceKey | null, from: string, to: string): Promise<ComingUpItem[]> {
  const rows = await db
    .select({ id: leads.id, title: leads.title, workspace: leads.workspace, next: leads.nextFollowUpAt, company: companies.name })
    .from(leads)
    .innerJoin(leadStages, eq(leadStages.id, leads.stageId))
    .leftJoin(companies, eq(companies.id, leads.companyId))
    .where(
      and(
        eq(leadStages.kind, "open"),
        gte(leads.nextFollowUpAt, istToInstant(from)),
        lte(leads.nextFollowUpAt, istToInstant(addDays(to, 1))),
        ws ? eq(leads.workspace, ws) : undefined,
      ),
    )
    .orderBy(leads.nextFollowUpAt)
    .limit(40);
  return rows
    .map((r) => ({
      key: `lead:${r.id}`,
      kind: "lead" as const,
      title: `Follow up: ${r.title}`,
      sub: r.company,
      href: `/crm/leads/${r.id}`,
      date: toISTDate(r.next!),
      workspace: r.workspace,
    }))
    .filter((r) => r.date >= from && r.date <= to);
}
