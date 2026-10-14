import { beforeAll, describe, expect, it, vi } from "vitest";
import React, { cloneElement, isValidElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("view=board"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => React.createElement("a", { href, ...rest }, children),
}));

import { db } from "@/db";
import { bills, companies, contacts, invoices, leads, leadStages, milestones, projects, tasks, timeEntries } from "@/db/schema";
import { resetDb } from "@/test/db";
import { addDays, todayIST } from "@/lib/dates";
import { eq } from "drizzle-orm";

async function resolve(node: unknown): Promise<unknown> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (node instanceof Promise) return resolve(await node);
  if (!isValidElement(node)) return node;
  const el = node as React.ReactElement<Record<string, unknown>>;
  const type = el.type as unknown;
  if (typeof type === "function" && type.constructor.name === "AsyncFunction") {
    return resolve(await (type as (p: unknown) => Promise<unknown>)(el.props));
  }
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el.props ?? {})) props[k] = isValidElement(v) || Array.isArray(v) ? await resolve(v) : v;
  return cloneElement(el, props);
}

async function render(el: unknown) {
  const tree = (await resolve(el)) as React.ReactElement;
  return renderToString(tree);
}

let ids: { task: string; project: string };

describe("render smoke", () => {
  beforeAll(async () => {
    await resetDb();
    const today = todayIST();
    const [co] = await db.insert(companies).values({ workspace: "mahisys", name: "Sharma Traders" }).returning();
    const [p] = await db.insert(projects).values({ workspace: "mahisys", name: "Website revamp", companyId: co.id, deadline: addDays(today, 10), budgetHours: 20, valuePaise: 15_000_000 }).returning();
    await db.insert(milestones).values({ projectId: p.id, name: "Design sign-off", dueDate: addDays(today, 3) });
    const [c] = await db.insert(contacts).values({ workspace: "mahisys", name: "Asha", phone: "+91 98000 00000", companyId: co.id }).returning();
    const [stage] = await db.select().from(leadStages).where(eq(leadStages.kind, "open")).limit(1);
    const [lead] = await db.insert(leads).values({ workspace: "mahisys", title: "CRM rollout", stageId: stage.id, contactId: c.id, companyId: co.id }).returning();
    const [t] = await db
      .insert(tasks)
      .values({ workspace: "mahisys", title: "Build homepage", projectId: p.id, dueDate: today, estimateMinutes: 120, taskType: "development", linkedType: "lead", linkedId: lead.id, tags: ["web"], recurrence: { freq: "weekly", interval: 1 } })
      .returning();
    await db.insert(tasks).values([
      { workspace: "mahisys", title: "Step one", parentTaskId: t.id },
      { workspace: "personal", title: "Pay rent", dueDate: addDays(today, -2), priority: 1 },
      { workspace: "personal", title: "Groceries", dueDate: addDays(today, 2), status: "waiting" },
      { workspace: "mahisys", title: "Old win", status: "done", completedAt: new Date(), projectId: p.id },
    ]);
    await db.insert(timeEntries).values({ taskId: t.id, startedAt: new Date(Date.now() - 3600_000), endedAt: new Date(), minutes: 60 });
    await db.insert(timeEntries).values({ taskId: t.id, startedAt: new Date(Date.now() - 600_000) });
    await db.insert(bills).values({ workspace: "personal", title: "Electricity", amountPaise: 250_000, dueDate: addDays(today, 1) });
    await db.insert(invoices).values({ workspace: "mahisys", number: "MS-9", billTo: { name: "Sharma" }, issueDate: addDays(today, -30), dueDate: addDays(today, -5), status: "sent", totalPaise: 5_000_000, projectId: p.id });
    ids = { task: t.id, project: p.id };
  });

  it("renders Today", async () => {
    const { default: Page } = await import("@/app/(app)/page");
    const html = await render(React.createElement(Page));
    console.log("TODAYTEXT", html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 3000));
    expect(html).toContain("Needs you");
    expect(html).toContain("Build homepage");
    expect(html).toContain("CRM rollout");
    expect(html).toContain("MS-9");
  });

  it("renders Tasks list and board", async () => {
    const { default: Page } = await import("@/app/(app)/tasks/page");
    const list = await render(await Page({ searchParams: Promise.resolve({}) }));
    expect(list).toContain("Build homepage");
    expect(list).toContain("Overdue");
    const board = await render(await Page({ searchParams: Promise.resolve({ view: "board", new: "1", linkedType: "lead" }) }));
    expect(board).toContain("Waiting");
    const filtered = await render(await Page({ searchParams: Promise.resolve({ q: "zzz-nothing" }) }));
    expect(filtered).toContain("No tasks match");
  });

  it("renders a task", async () => {
    const { default: Page } = await import("@/app/(app)/tasks/[id]/page");
    const html = await render(await Page({ params: Promise.resolve({ id: ids.task }) }));
    expect(html).toContain("Build homepage");
    expect(html).toContain("Step one");
    expect(html).toContain("Time log");
  });

  it("renders projects", async () => {
    const { default: List } = await import("@/app/(app)/projects/page");
    const html = await render(await List({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Website revamp");
    const { default: Detail } = await import("@/app/(app)/projects/[id]/page");
    const d = await render(await Detail({ params: Promise.resolve({ id: ids.project }) }));
    console.log("PROJTEXT", d.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2500));
    expect(d).toContain("Design sign-off");
    expect(d).toContain("MS-9");
  });

  it("renders an empty Today", async () => {
    await resetDb();
    const { default: Page } = await import("@/app/(app)/page");
    const html = await render(React.createElement(Page));
    expect(html).toContain("All caught up");
  });
});
