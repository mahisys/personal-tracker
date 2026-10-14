import { NextResponse } from "next/server";
import { db } from "@/db";
import { pushTokens } from "@/db/schema";
import { getUser } from "@/server/auth";

export async function POST(req: Request) {
  if (!(await getUser())) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token || token.length > 4096) return NextResponse.json({ error: "bad token" }, { status: 400 });
  await db
    .insert(pushTokens)
    .values({ token, userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null, lastUsedAt: new Date() })
    .onConflictDoUpdate({ target: pushTokens.token, set: { lastUsedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
