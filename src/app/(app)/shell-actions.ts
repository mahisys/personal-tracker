"use server";
import { cookies } from "next/headers";
import { WORKSPACE_KEYS } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { WS_COOKIE } from "@/server/workspace";

export async function setWorkspaceFilter(value: string) {
  await requireUser();
  const jar = await cookies();
  if ((WORKSPACE_KEYS as readonly string[]).includes(value)) jar.set(WS_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else jar.delete(WS_COOKIE);
}
