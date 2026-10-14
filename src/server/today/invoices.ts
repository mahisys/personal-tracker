import "server-only";
import { and, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, type WorkspaceKey } from "@/db/schema";
import { diffDays } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { ComingUpItem, NeedsItem } from "./types";

const UNPAID = ["sent", "part_paid"] as const;
const balance = sql<number>`(${invoices.totalPaise} - ${invoices.paidPaise})`;

/** Sent / part-paid invoices past their due date with money still owed. */
export async function invoicesNeedingYou(ws: WorkspaceKey | null, today: string): Promise<NeedsItem[]> {
  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      workspace: invoices.workspace,
      dueDate: invoices.dueDate,
      billTo: invoices.billTo,
      balance: sql<number>`${balance}::bigint`,
    })
    .from(invoices)
    .where(and(inArray(invoices.status, [...UNPAID]), lt(invoices.dueDate, today), sql`${balance} > 0`, ws ? eq(invoices.workspace, ws) : undefined))
    .orderBy(invoices.dueDate, invoices.number)
    .limit(100);
  return rows.map((r) => {
    const n = diffDays(r.dueDate, today);
    return {
      key: `invoice:${r.id}`,
      kind: "invoice" as const,
      id: r.id,
      title: `${r.number} · ${r.billTo?.name ?? "Client"}`,
      context: `${formatINR(Number(r.balance), { whole: true })} to collect · ${n === 1 ? "was due yesterday" : `${n} days overdue`}`,
      workspace: r.workspace,
      href: `/invoices/${r.id}`,
      date: r.dueDate,
      overdue: true,
      amountPaise: Number(r.balance),
    };
  });
}

/** Balance still owed on invoices due by `to` (overdue included). */
export async function invoicesExpectedTotal(ws: WorkspaceKey | null, to: string) {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${balance}), 0)::bigint`, n: sql<number>`count(*)::int` })
    .from(invoices)
    .where(and(inArray(invoices.status, [...UNPAID]), lte(invoices.dueDate, to), sql`${balance} > 0`, ws ? eq(invoices.workspace, ws) : undefined));
  return { totalPaise: Number(r?.total ?? 0), count: r?.n ?? 0 };
}

export async function invoicesComingUp(ws: WorkspaceKey | null, from: string, to: string): Promise<ComingUpItem[]> {
  const rows = await db
    .select({ id: invoices.id, number: invoices.number, workspace: invoices.workspace, dueDate: invoices.dueDate, billTo: invoices.billTo, balance: sql<number>`${balance}::bigint` })
    .from(invoices)
    .where(and(inArray(invoices.status, [...UNPAID]), gte(invoices.dueDate, from), lte(invoices.dueDate, to), sql`${balance} > 0`, ws ? eq(invoices.workspace, ws) : undefined))
    .orderBy(invoices.dueDate)
    .limit(40);
  return rows.map((r) => ({
    key: `invoice:${r.id}`,
    kind: "invoice" as const,
    title: `${r.number} due`,
    sub: r.billTo?.name ?? null,
    href: `/invoices/${r.id}`,
    date: r.dueDate,
    workspace: r.workspace,
    amountPaise: Number(r.balance),
    flow: "in" as const,
  }));
}
