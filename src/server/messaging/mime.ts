/**
 * Minimal RFC 2822 / MIME builder for the Gmail API (pure, no server-only imports so it is unit-testable).
 * Produces multipart/alternative (text + HTML), UTF-8, base64 bodies, RFC 2047 encoded headers.
 */

const MAX_ENCODED_WORD_BYTES = 45; // 45 bytes → 60 base64 chars, + 12 for "=?UTF-8?B??=" ≤ 75

/** Removes CR/LF so user-supplied values can never inject extra headers. */
export function sanitizeHeader(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 "encoded-word" for non-ASCII header text; plain ASCII is returned unchanged. */
export function encodeHeader(value: string): string {
  const v = sanitizeHeader(value);
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  const words: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const ch of v) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > MAX_ENCODED_WORD_BYTES && chunk) {
      words.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += ch;
    bytes += b;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

/** "Display Name <addr@x>" with the name encoded when needed. */
export function formatAddress(email: string, name?: string): string {
  const addr = sanitizeHeader(email);
  if (!name) return addr;
  const n = sanitizeHeader(name);
  const display = /^[\x20-\x7e]*$/.test(n) ? `"${n.replace(/["\\]/g, "")}"` : encodeHeader(n);
  return `${display} <${addr}>`;
}

function base64Body(s: string): string {
  return (Buffer.from(s, "utf8").toString("base64").match(/.{1,76}/g) ?? [""]).join("\r\n");
}

export type MimeInput = {
  from: string;
  fromName?: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** Override for deterministic tests */
  boundary?: string;
  date?: Date;
};

/** Strips tags for a plain-text fallback. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildMime(m: MimeInput): string {
  const boundary = m.boundary ?? `cc_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const to = (Array.isArray(m.to) ? m.to : [m.to]).map(sanitizeHeader).filter(Boolean).join(", ");
  const headers = [
    `From: ${formatAddress(m.from, m.fromName)}`,
    `To: ${to}`,
    m.replyTo ? `Reply-To: ${sanitizeHeader(m.replyTo)}` : null,
    `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${(m.date ?? new Date()).toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  const text = m.text ?? htmlToText(m.html);
  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(m.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** URL-safe base64 without padding, as the Gmail API `raw` field expects. */
export function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
