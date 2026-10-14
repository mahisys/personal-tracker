import { describe, expect, it } from "vitest";
import { buildMime, encodeHeader, formatAddress, htmlToText, sanitizeHeader, toBase64Url } from "./mime";
import { renderBriefingEmail, escapeHtml, type Briefing } from "./briefing";
import { planPushes } from "./push";

function fromB64Url(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

describe("MIME builder", () => {
  it("leaves ASCII subjects alone and encodes UTF-8 subjects as RFC 2047 words", () => {
    expect(encodeHeader("Hello there")).toBe("Hello there");
    const enc = encodeHeader("₹25,000 due — Morning ☀️");
    expect(enc).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    const decoded = enc
      .split("\r\n ")
      .map((w) => Buffer.from(w.slice(10, -2), "base64").toString("utf8"))
      .join("");
    expect(decoded).toBe("₹25,000 due — Morning ☀️");
  });
  it("splits long UTF-8 subjects into ≤75 char encoded words without breaking characters", () => {
    const long = "नमस्ते ".repeat(20);
    const words = encodeHeader(long).split("\r\n ");
    expect(words.length).toBeGreaterThan(1);
    for (const w of words) expect(w.length).toBeLessThanOrEqual(75);
    expect(words.map((w) => Buffer.from(w.slice(10, -2), "base64").toString("utf8")).join("")).toBe(long.trim());
  });
  it("strips header injection", () => {
    expect(sanitizeHeader("a\r\nBcc: evil@x.com")).toBe("a Bcc: evil@x.com");
    const mime = buildMime({ from: "me@x.com", to: "you@y.com", subject: "Hi\r\nBcc: evil@x.com", html: "<p>x</p>", boundary: "B" });
    expect(mime).not.toMatch(/\r\nBcc:/);
  });
  it("builds multipart/alternative with base64 UTF-8 parts", () => {
    const mime = buildMime({ from: "me@x.com", fromName: "Command Center", to: ["you@y.com"], subject: "Digest ₹", html: "<p>Namaste ₹100</p>", boundary: "BOUND", date: new Date("2026-10-14T00:00:00Z") });
    expect(mime).toContain('From: "Command Center" <me@x.com>');
    expect(mime).toContain("To: you@y.com");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="BOUND"');
    expect(mime).toContain("Content-Type: text/html; charset=UTF-8");
    expect(mime.endsWith("--BOUND--\r\n")).toBe(true);
    const htmlPart = mime.split("--BOUND")[2].split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(htmlPart, "base64").toString("utf8")).toBe("<p>Namaste ₹100</p>");
    const textPart = mime.split("--BOUND")[1].split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(textPart, "base64").toString("utf8")).toBe("Namaste ₹100");
  });
  it("encodes non-ASCII display names", () => {
    expect(formatAddress("a@b.com", "Mahi ✨")).toMatch(/^=\?UTF-8\?B\?.+\?= <a@b.com>$/);
  });
  it("base64url has no +, / or padding and round-trips", () => {
    const s = "subject?>>>~~~ ₹ é";
    const enc = toBase64Url(s);
    expect(enc).not.toMatch(/[+/=]/);
    expect(fromB64Url(enc)).toBe(s);
  });
  it("converts HTML to text", () => {
    expect(htmlToText("<p>Hello &amp; welcome</p><br/>Bye")).toBe("Hello & welcome\n\nBye");
  });
});

describe("briefing email", () => {
  const b: Briefing = {
    kind: "digest",
    title: "Good morning <you>",
    subtitle: "sub",
    summary: "s",
    stats: [{ label: "Cash", value: "₹1L", tone: "good" }],
    sections: [
      { heading: "Tasks", items: [{ label: "Call <Ravi>", meta: "P1", href: "/tasks/1" }], more: 2, href: "/tasks" },
      { heading: "Bills", items: [], note: "None due" },
    ],
    footer: "Bye",
  };
  it("escapes content and makes links absolute", () => {
    const { html, text, subject } = renderBriefingEmail(b, "https://cc.example.com/");
    expect(subject).toBe("Good morning <you>");
    expect(html).toContain("Good morning &lt;you&gt;");
    expect(html).toContain('href="https://cc.example.com/tasks/1"');
    expect(html).toContain("+2 more");
    expect(html).toContain("None due");
    expect(text).toContain("- Call <Ravi> — P1");
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });
});

describe("push planning", () => {
  const row = (i: number, kind = "bill_due") => ({ id: String(i), kind, title: `T${i}`, body: `B${i}`, link: `/x/${i}` });
  it("sends up to three individually", () => {
    expect(planPushes([row(1), row(2), row(3)])).toHaveLength(3);
  });
  it("summarises many, keeping the digest separate", () => {
    const p = planPushes([row(0, "digest"), row(1), row(2), row(3), row(4), row(5), row(6)]);
    expect(p).toHaveLength(2);
    expect(p[0].tag).toBe("digest:0");
    expect(p[1].title).toBe("6 new alerts");
    expect(p[1].body).toContain("+2 more");
  });
});
