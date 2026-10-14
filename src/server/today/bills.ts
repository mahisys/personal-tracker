import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bills, type WorkspaceKey } from "@/db/schema";
import { addDays, diffDays } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { ComingUpItem, NeedsItem } from "./types";

/** Unpaid bills due within `days` days (overdue included). */
export async function billsNeedingYou(ws: WorkspaceKey | null, today: string, days = 3): Promise<NeedsItem[]> {
  const rows = await db
    .select()
    .from(bills)
    .where(and(eq(bills.status, "upcoming"), lte(bills.dueDate, addDays(today, days)), ws ? eq(bills.workspace, ws) : undefined))
    .orderBy(bills.dueDate)
    .limit(100);
  return rows.map((b) => {
    const n = diffDays(today, b.dueDate);
    const when = n < 0 ? `Overdue by ${-n} day${n === -1 ? "" : "s"}` : n === 0 ? "Due today" : n === 1 ? "Due tomorrow" : `Due in ${n} days`;
    return {
      key: `bill:${b.id}`,
      kind: "bill" as const,
      id: b.id,
      title: b.title,
      context: [`${formatINR(b.amountPaise, { whole: true })} · ${when}`, b.payee, b.priority === "must" ? "Must pay" : null].filter(Boolean).join(" · "),
      workspace: b.workspace,
      href: `/planner/bills/${b.id}`,
      date: b.dueDate,
      overdue: b.dueDate < today,
      amountPaise: b.amountPaise,
    };
  });
}

/** Total of unpaid bills due by today + days (overdue included). */
export async function billsDueTotal(ws: WorkspaceKey | null, today: string, days = 7) {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${bills.amountPaise}), 0)::bigint`, n: sql<number>`count(*)::int` })
    .from(bills)
    .where(and(eq(bills.status, "upcoming"), lte(bills.dueDate, addDays(today, days)), ws ? eq(bills.workspace, ws) : undefined));
  return { totalPaise: Number(r?.total ?? 0), count: r?.n ?? 0 };
}

export async function billsComingUp(ws: WorkspaceKey | null, from: string, to: string): Promise<ComingUpItem[]> {
  const rows = await db
    .select()
    .from(bills)
    .where(and(eq(bills.status, "upcoming"), gte(bills.dueDate, from), lte(bills.dueDate, to), ws ? eq(bills.workspace, ws) : undefined))
    .orderBy(bills.dueDate)
    .limit(40);
  return rows.map((b) => ({
    key: `bill:${b.id}`,
    kind: "bill" as const,
    title: b.title,
    sub: b.payee,
    href: `/planner/bills/${b.id}`,
    date: b.dueDate,
    workspace: b.workspace,
    amountPaise: b.amountPaise,
    flow: "out" as const,
  }));
}
