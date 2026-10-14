import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, leadStages, leads, tasks } from "@/db/schema";
import { resetDb } from "@/test/db";
import { istToInstant } from "@/lib/dates";
import { fd } from "@/server/invoices/test-helpers";
import { addLeadTask, logLeadActivity, moveLead, saveLead, setLeadFollowUp } from "./actions";

describe("logging lead activities", () => {
  beforeEach(resetDb);

  async function newLead() {
    await saveLead(undefined, fd({ title: "CRM setup", workspace: "mahisys", contactName: "Anita", companyName: "Rao & Co" }));
    const [lead] = await db.select().from(leads);
    return lead;
  }

  it("requires the next follow-up for an open lead", async () => {
    const lead = await newLead();
    const r = await logLeadActivity(undefined, fd({ leadId: lead.id, type: "call", outcome: "Interested" }));
    expect(r).toMatchObject({ ok: false });
    expect(await db.select().from(activities)).toHaveLength(0);
  });

  it("updates lastActivityAt and the follow-up, and links contact + company", async () => {
    const lead = await newLead();
    expect(lead.lastActivityAt).toBeNull();
    const r = await logLeadActivity(
      undefined,
      fd({ leadId: lead.id, type: "meeting", subject: "Demo", outcome: "Loved it", nextStep: "Send proposal", at: "2026-10-14T11:30", nextFollowUp: "2026-10-17T15:00" }),
    );
    expect(r).toMatchObject({ ok: true });
    const [after] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.lastActivityAt?.toISOString()).toBe(istToInstant("2026-10-14", "11:30").toISOString());
    expect(after.nextFollowUpAt?.toISOString()).toBe(istToInstant("2026-10-17", "15:00").toISOString());
    const [a] = await db.select().from(activities);
    expect(a).toMatchObject({ type: "meeting", subject: "Demo", outcome: "Loved it", nextStep: "Send proposal", leadId: lead.id, contactId: lead.contactId, companyId: lead.companyId, workspace: "mahisys" });
  });

  it("a plain date follow-up means 10 am IST; closed leads need no follow-up", async () => {
    const lead = await newLead();
    await logLeadActivity(undefined, fd({ leadId: lead.id, type: "whatsapp", nextFollowUp: "2026-10-20" }));
    let [after] = await db.select().from(leads);
    expect(after.nextFollowUpAt?.toISOString()).toBe(istToInstant("2026-10-20", "10:00").toISOString());

    const [won] = await db.select().from(leadStages).where(eq(leadStages.kind, "won"));
    await moveLead(undefined, fd({ id: lead.id, stageId: won.id }));
    const r = await logLeadActivity(undefined, fd({ leadId: lead.id, type: "note", body: "Kick-off done" }));
    expect(r).toMatchObject({ ok: true });
    [after] = await db.select().from(leads);
    expect(after.lastActivityAt).not.toBeNull();
  });

  it("quick follow-up buttons and linked tasks", async () => {
    const lead = await newLead();
    await setLeadFollowUp(undefined, fd({ id: lead.id, days: 3 }));
    const [after] = await db.select().from(leads);
    expect(after.nextFollowUpAt!.getTime()).toBeGreaterThan(Date.now());
    await addLeadTask(undefined, fd({ leadId: lead.id, title: "Prepare proposal", dueDate: "2026-10-16" }));
    const [t] = await db.select().from(tasks);
    expect(t).toMatchObject({ linkedType: "lead", linkedId: lead.id, workspace: "mahisys", title: "Prepare proposal", dueDate: "2026-10-16" });
  });
});
