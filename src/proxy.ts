import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: no session cookie → go to /login. Every page and action still verifies
 * the cookie with requireUser(), so this is never the security boundary.
 */
export function proxy(req: NextRequest) {
  if (process.env.AUTH_MODE === "dev") return NextResponse.next();
  if (!req.cookies.get("__session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/auth|api/cron|api/health|sw.js|manifest.webmanifest|icon|_next|favicon).*)"],
};
