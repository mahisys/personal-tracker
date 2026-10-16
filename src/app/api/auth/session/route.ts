import { NextResponse } from "next/server";
import { getAdminAuth } from "@/server/firebase-admin";
import { isAllowedEmail, SESSION_COOKIE } from "@/server/auth";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/** Exchanges a fresh Firebase ID token for a 14-day httpOnly session cookie — only for allowed emails. */
export async function POST(req: Request) {
  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    if (!isAllowedEmail(decoded.email)) {
      console.warn(`[auth] sign-in refused: ${decoded.email} is not in ALLOWED_EMAILS`);
      return NextResponse.json(
        { error: `${decoded.email} is not on this app's allowed list. Sign in with the email you gave the deploy script.` },
        { status: 403 },
      );
    }
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }
    const cookie = await auth.createSessionCookie(idToken, { expiresIn: FOURTEEN_DAYS_MS });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: FOURTEEN_DAYS_MS / 1000,
    });
    return res;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "unknown";
    console.error(`[auth] session creation failed (${code}):`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: `Sign-in could not be completed on the server (${code}). Please try again.` }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
