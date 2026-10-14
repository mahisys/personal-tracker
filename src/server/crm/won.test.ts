import { beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, companies, invoices, leadStages, leads, lineItems, projects, quotes, settings } from "@/db/schema";
import { resetDb } from "@/test/db";
import { fd, sampleItems } from "@/server/invoices/test-helpers";
import { saveQuote, setQuoteStatus } from "@/server/sales/actions";
import { moveLead, saveLead } from "./actions";

async function stage(name: string) {
  const [s] = await db.select().from(leadStages).where(eq(leadStages.name, name));
  return s;
}

describe("moving a lead through the pipeline", () => {
  beforeEach(async () => {
    await resetDb();
    await db.insert(settings).values({ key: "business", value: { invoicePrefix: "MS", stateCode: "27" } });
  });

  it("creates the lead with inline company + contact and the first stage's probability", async () => {
    const r = await saveLead(undefined, fd({ title: "ERP rollout", workspace: "mahisys", value: "2,50,000", companyName: "Kumar Steels", contactName: "Ravi Kumar", phone: "98200 12345", source: "Referral" }));
    expect(r).toMatchObject({ ok: true });
    const [lead] = await db.select().from(leads);
    const [c] = await db.select().from(companies);
    expect(c.name).toBe("Kumar Steels");
    expect(lead).toMatchObject({ valuePaise: 25_000_000, probability: 10, companyId: c.id, source: "Referral" });
    expect(lead.contactId).not.toBeNull();
    expect(lead.nextFollowUpAt).not.toBeNull();
    // Re-using the same names links to the same records
    await saveLead(undefined, fd({ title: "AMC", workspace: "mahisys", companyName: "kumar steels", contactName: "ravi kumar" }));
    expect(await db.select().from(companies)).toHaveLength(1);
  });

  it("entering a stage sets its default probability; lost needs a reason", async () => {
    await saveLead(undefined, fd({ title: "Website", workspace: "mahisys", value: "50000" }));
    const [lead] = await db.select().from(leads);
    const proposal = await stage("Proposal sent");
    expect(await moveLead(undefined, fd({ id: lead.id, stageId: proposal.id }))).toMatchObject({ ok: true });
    expect((await db.select().from(leads))[0].probability).toBe(55);

    const lost = await stage("Lost");
    expect(await moveLead(undefined, fd({ id: lead.id, stageId: lost.id }))).toMatchObject({ ok: false });
    expect(await moveLead(undefined, fd({ id: lead.id, stageId: lost.id, lostReason: "Went with a cheaper vendor" }))).toMatchObject({ ok: true });
    const [after] = await db.select().from(leads);
    expect(after).toMatchObject({ probability: 0, lostReason: "Went with a cheaper vendor", nextFollowUpAt: null });
    expect(after.closedAt).not.toBeNull();

    // Re-opening clears closedAt and the reason
    await moveLead(undefined, fd({ id: lead.id, stageId: proposal.id }));
    expect((await db.select().from(leads))[0]).toMatchObject({ closedAt: null, lostReason: null, probability: 55 });
  });

  it("won → project + draft invoice copied from the accepted quote, in one go", async () => {
    await saveLead(undefined, fd({ title: "Website revamp", workspace: "mahisys", value: "64900", companyName: "Sharma Traders" }));
    const [lead] = await db.select().from(leads);
    await db.update(companies).set({ stateCode: "29", gstin: "29ABCDE1234F1Z5" });
    // An older draft quote and an accepted one — the accepted one wins
    await saveQuote(undefined, fd({ leadId: lead.id, companyId: lead.companyId, issueDate: "2026-10-01", items: JSON.stringify([{ description: "Old", quantity: "1", unitPrice: "100", gstRate: "18" }]) }));
    await saveQuote(undefined, fd({ leadId: lead.id, companyId: lead.companyId, issueDate: "2026-10-02", placeOfSupply: "29", items: sampleItems }));
    const qs = await db.select().from(quotes).orderBy(asc(quotes.createdAt));
    await setQuoteStatus(undefined, fd({ id: qs[1].id, status: "sent" }));
    await setQuoteStatus(undefined, fd({ id: qs[1].id, status: "accepted" }));

    const won = await stage("Won");
    const r = await moveLead(undefined, fd({ id: lead.id, stageId: won.id }));
    expect(r).toMatchObject({ ok: true, celebrate: true });

    const [after] = await db.select().from(leads);
    expect(after.closedAt).not.toBeNull();
    expect(after.probability).toBe(100);

    const projs = await db.select().from(projects);
    expect(projs).toHaveLength(1);
    expect(projs[0]).toMatchObject({ workspace: "mahisys", name: "Website revamp", companyId: lead.companyId, valuePaise: 6_490_000 });

    const invs = await db.select().from(invoices);
    expect(invs).toHaveLength(1);
    expect(invs[0]).toMatchObject({ status: "draft", leadId: lead.id, quoteId: qs[1].id, projectId: projs[0].id, interstate: true, totalPaise: 6_490_000 });
    expect(invs[0].billTo).toMatchObject({ name: "Sharma Traders", gstin: "29ABCDE1234F1Z5", stateCode: "29" });
    expect(r && "invoiceId" in r ? r.invoiceId : null).toBe(invs[0].id);
    const items = await db.select().from(lineItems).where(eq(lineItems.docId, invs[0].id));
    expect(items.map((i) => i.description).sort()).toEqual(["Logo", "Website design"]);
    const [q] = await db.select().from(quotes).where(eq(quotes.id, qs[1].id));
    expect(q.invoiceId).toBe(invs[0].id);

    // Moving out and back to won does not duplicate anything
    const neg = await stage("Negotiation");
    await moveLead(undefined, fd({ id: lead.id, stageId: neg.id }));
    await moveLead(undefined, fd({ id: lead.id, stageId: won.id }));
    expect(await db.select().from(projects)).toHaveLength(1);
    expect(await db.select().from(invoices)).toHaveLength(1);
    const hist = await db.select().from(activityLog).where(eq(activityLog.entityId, lead.id));
    expect(hist.some((h) => h.action === "won")).toBe(true);
  });

  it("won without a quote still creates the project", async () => {
    await saveLead(undefined, fd({ title: "Consulting", workspace: "mahisys", value: "10000" }));
    const [lead] = await db.select().from(leads);
    const r = await moveLead(undefined, fd({ id: lead.id, stageId: (await stage("Won")).id }));
    expect(r).toMatchObject({ ok: true, celebrate: true, invoiceId: null });
    expect(await db.select().from(projects)).toHaveLength(1);
    expect(await db.select().from(invoices)).toHaveLength(0);
  });
});
