import { eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { getUser } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getLineItems } from "@/server/invoices/core";
import { renderInvoicePdf } from "@/server/invoices/pdf";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Unauthorised", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) return new Response("Not found", { status: 404 });
  const [items, settings] = await Promise.all([getLineItems(db, "invoice", id), getSettings()]);
  const pdf = await renderInvoicePdf(inv, items, settings);
  const fileName = `Invoice-${inv.number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
      "cache-control": "private, no-store",
    },
  });
}
