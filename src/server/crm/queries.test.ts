import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { accounts, invoices, leadStages, leads, quotes, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resetDb } from "@/test/db";
import { fd, sampleItems } from "@/server/invoices/test-helpers";
import { logLeadActivity, moveLead, saveCompany, saveContact, saveLead } from "./actions";
import { getCompanyDetail, getContactDetail, getLeadDetail, getPipeline, listCompanies, listContacts, listStages } from "./queries";
import { saveQuote, saveSalesTarget } from "@/server/sales/actions";
import { getQuoteDetail, getSalesDashboard, listQuotes } from "@/server/sales/queries";
import { markInvoiceSent, recordInvoicePayment, saveInvoice } from "@/server/invoices/actions";
import { getInvoiceDetail, invoiceStats, listInvoices } from "@/server/invoices/queries";
import { todayIST } from "@/lib/dates";

describe("page queries (smoke)", () => {
  beforeEach(async () => {
    await resetDb();
    await db.insert(settings).values({ key: "business", value: { stateCode: "27" } });
  });

  it("load every CRM, sales and invoice page's data", async () => {
    expect(await saveCompany(undefined, fd({ name: "Bad GST", gstin: "12345" }))).toMatchObject({ ok: false });
    await saveCompany(undefined, fd({ name: "Kumar Steels", gstin: "29abcde1234f1z5", workspace: "mahisys" }));
    await saveContact(undefined, fd({ name: "Ravi", companyName: "Kumar Steels", phone: "9820012345", workspace: "mahisys" }));
    await saveLead(undefined, fd({ title: "ERP", workspace: "mahisys", value: "100000", companyName: "Kumar Steels", contactName: "Ravi", source: "Referral" }));
    await saveLead(undefined, fd({ title: "Website", workspace: "mahisys", value: "50000", source: "Website" }));
    const [lead] = await db.select().from(leads).where(eq(leads.title, "ERP"));
    expect(lead.companyId).not.toBeNull();
    await logLeadActivity(undefined, fd({ leadId: lead.id, type: "call", nextFollowUp: todayIST() }));
    await saveQuote(undefined, fd({ leadId: lead.id, companyId: lead.companyId, items: sampleItems }));
    const [won] = await db.select().from(leadStages).where(eq(leadStages.kind, "won"));
    await moveLead(undefined, fd({ id: lead.id, stageId: won.id }));
    const [inv] = await db.select().from(invoices);
    await markInvoiceSent(undefined, fd({ id: inv.id }));
    const [acct] = await db.select().from(accounts);
    await recordInvoicePayment(undefined, fd({ invoiceId: inv.id, accountId: acct.id, amount: "10000", date: todayIST() }));
    await saveInvoice(undefined, fd({ billToName: "Walk-in", items: sampleItems, issueDate: "2026-01-01", dueDate: "2026-01-15" }));
    await saveSalesTarget(undefined, fd({ workspace: "mahisys", target: "500000" }));

    const p = await getPipeline(null);
    expect(p.stages.length).toBe(7);
    expect(p.leads.map((l) => l.title)).toEqual(["Website"]);
    expect(p.closedRecent.map((l) => l.title)).toEqual(["ERP"]);
    expect(p.stats.wonThisMonthCount).toBe(1);

    const ld = await getLeadDetail(lead.id);
    expect(ld?.activities).toHaveLength(1);
    expect(ld?.invoices).toHaveLength(1);
    expect(ld?.quotes).toHaveLength(1);

    const contacts = await listContacts(null, "rav");
    expect(contacts).toHaveLength(1);
    const companies = await listCompanies(null, null);
    expect(companies.find((c) => c.company.name === "Kumar Steels")).toMatchObject({ company: { gstin: "29ABCDE1234F1Z5", stateCode: "29" } });
    expect((await getContactDetail(contacts[0].contact.id))?.leads).toHaveLength(1);
    const cd = await getCompanyDetail(lead.companyId!);
    expect(cd?.projects).toHaveLength(1);
    expect(cd?.invoices).toHaveLength(1);
    expect(await listStages("mahisys")).toHaveLength(7);

    const s = await getSalesDashboard(null);
    expect(s.target?.targetPaise).toBe(50_000_000);
    expect(s.winRate).toBe(100);
    expect(s.chart).toHaveLength(12);
    expect(s.sources.length).toBe(2);
    expect(await listQuotes(null)).toHaveLength(1);
    const [q] = await db.select().from(quotes);
    expect((await getQuoteDetail(q.id))?.invoice?.id).toBe(inv.id);

    const rows = await listInvoices(null);
    expect(rows).toHaveLength(2);
    const st = await invoiceStats(null, rows);
    expect(st.collected).toBe(1_000_000);
    expect(st.overdue).toBe(0); // the walk-in invoice is still a draft
    const det = await getInvoiceDetail(inv.id);
    expect(det?.payments).toHaveLength(1);
    expect(det?.reminderContact?.name).toBe("Ravi");
  });
});
