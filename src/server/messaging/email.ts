import "server-only";
import { OAuth2Client } from "google-auth-library";
import { buildMime, toBase64Url } from "./mime";

/**
 * Sends email through the Gmail API as the app owner (users.messages.send), using an OAuth2 refresh token.
 *
 * Environment:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET — an OAuth client (type "Web application" or "Desktop") in the
 *     same Google Cloud project, with the Gmail API enabled.
 *   GMAIL_REFRESH_TOKEN — a refresh token for the sender account with scope
 *     https://www.googleapis.com/auth/gmail.send
 *   GMAIL_SENDER — the sender address (the account that granted the token).
 *
 * Getting the refresh token (one time, no script needed):
 *   1. Cloud Console → APIs & Services → enable "Gmail API". OAuth consent screen: External/Internal,
 *      add your address as a test user, add scope gmail.send. Publish the app ("In production") so the
 *      refresh token does not expire after 7 days.
 *   2. Credentials → Create OAuth client ID → "Web application", add the authorised redirect URI
 *      https://developers.google.com/oauthplayground
 *   3. Open https://developers.google.com/oauthplayground → gear icon → "Use your own OAuth credentials",
 *      paste the client ID and secret.
 *   4. In step 1 enter the scope https://www.googleapis.com/auth/gmail.send → Authorize APIs → sign in as
 *      the sender → step 2 "Exchange authorization code for tokens" → copy the Refresh token.
 *   5. Store GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN in Secret Manager and expose them to Cloud Run
 *      as environment variables, with GMAIL_CLIENT_ID and GMAIL_SENDER as plain env vars.
 */

export type EmailResult = { ok: true; id: string } | { ok: false; skipped: true; reason: string } | { ok: false; skipped?: false; error: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_SENDER);
}

let client: OAuth2Client | null = null;

function oauthClient(): OAuth2Client {
  if (client) return client;
  client = new OAuth2Client({ clientId: process.env.GMAIL_CLIENT_ID, clientSecret: process.env.GMAIL_CLIENT_SECRET });
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return client;
}

export async function sendEmail(msg: { to: string | string[]; subject: string; html: string; text?: string; fromName?: string }): Promise<EmailResult> {
  if (!emailConfigured()) return { ok: false, skipped: true, reason: "Gmail is not configured" };
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).filter(Boolean);
  if (!to.length) return { ok: false, skipped: true, reason: "No recipient" };
  try {
    const { token } = await oauthClient().getAccessToken();
    if (!token) return { ok: false, error: "Could not get a Gmail access token" };
    const raw = toBase64Url(
      buildMime({ from: process.env.GMAIL_SENDER!, fromName: msg.fromName ?? "Command Center", to, subject: msg.subject, html: msg.html, text: msg.text }),
    );
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Gmail API ${res.status}: ${detail.slice(0, 300)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Where alert emails go: the digest address from settings, else the sender itself. */
export function alertRecipient(digestEmail: string | null | undefined): string {
  return (digestEmail || process.env.GMAIL_SENDER || "").trim();
}
