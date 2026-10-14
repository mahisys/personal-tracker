import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAuth } from "./firebase-admin";

export const SESSION_COOKIE = "__session";

export type SessionUser = { email: string; uid: string };

export function isDevAuth(): boolean {
  return process.env.AUTH_MODE === "dev";
}

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.toLowerCase());
}

/** The signed-in user, or null. Verifies the Firebase session cookie. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  if (isDevAuth()) return { email: "dev@localhost", uid: "dev" };
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    if (!isAllowedEmail(decoded.email)) return null;
    return { email: decoded.email!, uid: decoded.uid };
  } catch {
    return null;
  }
});

/** Use at the top of every page and server action. Redirects to /login when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
