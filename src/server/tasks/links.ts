import "server-only";
import { desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bills, borrowers, companies, contacts, invoices, leads, loanFiles, LINKED_ENTITY_TYPES, type LinkedEntityType } from "@/db/schema";

export type LinkTarget = { id: string; label: string; sub?: string | null };

const productLabel = (p: string) => p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace("Lap", "LAP");

export function isLinkedType(v: unknown): v is LinkedEntityType {
  return (LINKED_ENTITY_TYPES as readonly string[]).includes(v as string);
}

/** Human labels for linked records, batched per type. Key = `${type}:${id}`. */
export async function resolveLinkLabels(pairs: { type: LinkedEntityType | null; id: string | null }[]): Promise<Map<string, string>> {
  const byType = new Map<LinkedEntityType, Set<string>>();
  for (const p of pairs) if (p.type && p.id) (byType.get(p.type) ?? byType.set(p.type, new Set()).get(p.type)!).add(p.id);
  const out = new Map<string, string>();
  await Promise.all(
    [...byType.entries()].map(async ([type, set]) => {
      const ids = [...set];
      for (const r of await fetchTargets(type, { ids })) out.set(`${type}:${r.id}`, r.label);
    }),
  );
  return out;
}

/** Records to link a task to: by ids, or a search (most recent first, max 20). */
export async function fetchTargets(type: LinkedEntityType, q: { ids?: string[]; search?: string }): Promise<LinkTarget[]> {
  const term = q.search?.trim() ? `%${q.search.trim()}%` : null;
  const limit = q.ids ? q.ids.length : 20;
  if (q.ids && q.ids.length === 0) return [];
  switch (type) {
    case "lead": {
      const rows = await db
        .select({ id: leads.id, label: leads.title, sub: companies.name })
        .from(leads)
        .leftJoin(companies, eq(companies.id, leads.companyId))
        .where(q.ids ? inArray(leads.id, q.ids) : term ? or(ilike(leads.title, term), ilike(companies.name, term)) : undefined)
        .orderBy(desc(leads.updatedAt))
        .limit(limit);
      return rows;
    }
    case "invoice": {
      const rows = await db
        .select({ id: invoices.id, number: invoices.number, name: sql<string>`${invoices.billTo}->>'name'` })
        .from(invoices)
        .where(q.ids ? inArray(invoices.id, q.ids) : term ? or(ilike(invoices.number, term), sql`${invoices.billTo}->>'name' ilike ${term}`) : undefined)
        .orderBy(desc(invoices.issueDate))
        .limit(limit);
      return rows.map((r) => ({ id: r.id, label: `${r.number}${r.name ? ` · ${r.name}` : ""}`, sub: r.name }));
    }
    case "loan_file": {
      const rows = await db
        .select({ id: loanFiles.id, name: borrowers.name, product: loanFiles.product, appNo: loanFiles.applicationNo })
        .from(loanFiles)
        .innerJoin(borrowers, eq(borrowers.id, loanFiles.borrowerId))
        .where(q.ids ? inArray(loanFiles.id, q.ids) : term ? or(ilike(borrowers.name, term), ilike(loanFiles.applicationNo, term)) : undefined)
        .orderBy(desc(loanFiles.updatedAt))
        .limit(limit);
      return rows.map((r) => ({ id: r.id, label: `${r.name} · ${productLabel(r.product)}`, sub: r.appNo }));
    }
    case "bill": {
      const rows = await db
        .select({ id: bills.id, label: bills.title, sub: bills.dueDate })
        .from(bills)
        .where(q.ids ? inArray(bills.id, q.ids) : term ? or(ilike(bills.title, term), ilike(bills.payee, term)) : undefined)
        .orderBy(desc(bills.dueDate))
        .limit(limit);
      return rows;
    }
    case "contact": {
      const rows = await db
        .select({ id: contacts.id, label: contacts.name, sub: contacts.phone })
        .from(contacts)
        .where(q.ids ? inArray(contacts.id, q.ids) : term ? or(ilike(contacts.name, term), ilike(contacts.phone, term)) : undefined)
        .orderBy(desc(contacts.updatedAt))
        .limit(limit);
      return rows;
    }
    case "company": {
      const rows = await db
        .select({ id: companies.id, label: companies.name, sub: companies.city })
        .from(companies)
        .where(q.ids ? inArray(companies.id, q.ids) : term ? ilike(companies.name, term) : undefined)
        .orderBy(desc(companies.updatedAt))
        .limit(limit);
      return rows;
    }
  }
}
