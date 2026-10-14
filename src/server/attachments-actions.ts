"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser } from "./auth";
import { deleteFile, putFile } from "./storage";
import { done, fail, type ActionResult } from "@/lib/action";

const MAX_BYTES = 15 * 1024 * 1024;

export async function uploadAttachment(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");
  const path = String(form.get("path") ?? "/");
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!entityType || !entityId) return fail("Missing record");
  if (files.length === 0) return fail("Choose a file first");
  for (const f of files) {
    if (f.size > MAX_BYTES) return fail(`${f.name} is larger than 15 MB`);
    const key = await putFile(entityType, f.name, f.type || "application/octet-stream", Buffer.from(await f.arrayBuffer()));
    await db.insert(attachments).values({ entityType, entityId, fileName: f.name, contentType: f.type || "application/octet-stream", sizeBytes: f.size, storagePath: key });
  }
  revalidatePath(path);
  return done(files.length === 1 ? "File attached" : `${files.length} files attached`);
}

export async function deleteAttachment(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireUser();
  const id = String(form.get("id") ?? "");
  const [row] = await db.delete(attachments).where(eq(attachments.id, id)).returning();
  if (row) await deleteFile(row.storagePath);
  revalidatePath(String(form.get("path") ?? "/"));
  return done("File removed");
}
