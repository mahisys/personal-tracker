import "server-only";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { renewals, type WorkspaceKey } from "@/db/schema";
import { diffDays, formatDay } from "@/lib/dates";
import type { ComingUpItem, NeedsItem } from "./types";

/** Not-yet-renewed items inside their reminder window (expiresOn − remindDaysBefore ≤ today), expired ones included. */
export async function renewalsNeedingYou(ws: WorkspaceKey | null, today: string): Promise<NeedsItem[]> {
  const rows = await db
    .select()
    .from(renewals)
    .where(
      and(
        isNull(renewals.renewedAt),
        sql`${renewals.expiresOn} - ${renewals.remindDaysBefore} <= ${today}::date`,
        ws ? eq(renewals.workspace, ws) : undefined,
      ),
    )
    .orderBy(renewals.expiresOn)
    .limit(50);
  return rows.map((r) => {
    const n = diffDays(today, r.expiresOn);
    const when = n < 0 ? `Expired ${-n === 1 ? "yesterday" : `${-n} days ago`}` : n === 0 ? "Expires today" : `Expires in ${n} day${n === 1 ? "" : "s"} (${formatDay(r.expiresOn, { short: true })})`;
    return {
      key: `renewal:${r.id}`,
      kind: "renewal" as const,
      id: r.id,
      title: `Renew ${r.name}`,
      context: [when, r.kind, r.number].filter(Boolean).join(" · "),
      workspace: r.workspace,
      href: "/planner/renewals",
      date: r.expiresOn,
      overdue: r.expiresOn < today,
    };
  });
}

export async function renewalsComingUp(ws: WorkspaceKey | null, from: string, to: string): Promise<ComingUpItem[]> {
  const rows = await db
    .select()
    .from(renewals)
    .where(and(isNull(renewals.renewedAt), gte(renewals.expiresOn, from), lte(renewals.expiresOn, to), ws ? eq(renewals.workspace, ws) : undefined))
    .orderBy(renewals.expiresOn)
    .limit(20);
  return rows.map((r) => ({
    key: `renewal:${r.id}`,
    kind: "renewal" as const,
    title: `${r.name} expires`,
    sub: r.kind,
    href: "/planner/renewals",
    date: r.expiresOn,
    workspace: r.workspace,
  }));
}
