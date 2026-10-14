import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { getUser } from "@/server/auth";
import { getFile } from "@/server/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Unauthorised", { status: 401 });
  const { id } = await ctx.params;
  const [a] = await db.select().from(attachments).where(eq(attachments.id, id));
  if (!a) return new Response("Not found", { status: 404 });
  const data = await getFile(a.storagePath);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": a.contentType,
      "content-disposition": `inline; filename="${encodeURIComponent(a.fileName)}"`,
      "cache-control": "private, max-age=300",
    },
  });
}
