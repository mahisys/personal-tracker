/**
 * A "briefing" is the shared shape of the morning digest and the weekly review: headline stats and
 * sections of linked items. It renders as an in-app notification body, a push summary and an HTML email.
 * Pure — safe to unit test.
 */

export type Tone = "good" | "warn" | "bad" | "brand" | "neutral";

export type BriefingItem = { label: string; meta?: string; href: string; tone?: Tone };
export type BriefingSection = { heading: string; items: BriefingItem[]; more?: number; href?: string; note?: string };
export type BriefingStat = { label: string; value: string; tone?: Tone; sub?: string };

export type Briefing = {
  kind: "digest" | "weekly_review";
  /** Email subject and notification title */
  title: string;
  /** Greeting line under the header */
  subtitle: string;
  /** One or two lines for the push and the notification body */
  summary: string;
  stats: BriefingStat[];
  sections: BriefingSection[];
  /** Encouraging closing line */
  footer: string;
};

const TONE_COLOR: Record<Tone, string> = {
  good: "#059669",
  warn: "#d97706",
  bad: "#e11d48",
  brand: "#6d5df6",
  neutral: "#6b6889",
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function abs(base: string, href: string): string {
  if (/^https?:\/\//.test(href)) return href;
  return `${base.replace(/\/+$/, "")}${href.startsWith("/") ? href : `/${href}`}`;
}

/** A nicely designed, inline-styled HTML email (tables for Gmail compatibility). */
export function renderBriefingEmail(b: Briefing, baseUrl: string): { subject: string; html: string; text: string } {
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;";
  const statCells = b.stats.map(
    (s) => `<td style="padding:6px;width:50%;vertical-align:top;">
  <div style="background:#f6f5ff;border:1px solid #e7e4fb;border-radius:14px;padding:12px 14px;">
    <div style="${font}font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b6889;">${escapeHtml(s.label)}</div>
    <div style="${font}font-size:20px;font-weight:800;color:${!s.tone || s.tone === "neutral" ? "#1d1b3a" : TONE_COLOR[s.tone]};margin-top:4px;">${escapeHtml(s.value)}</div>
    ${s.sub ? `<div style="${font}font-size:12px;color:#9a97b5;margin-top:2px;">${escapeHtml(s.sub)}</div>` : ""}
  </div>
</td>`,
  );
  // Two stats per row reads well on phones.
  const statRows: string[] = [];
  for (let i = 0; i < statCells.length; i += 2) statRows.push(`<tr>${statCells.slice(i, i + 2).join("")}</tr>`);

  const sections = b.sections
    .map((s) => {
      const items = s.items.length
        ? s.items
            .map(
              (it) => `<tr><td style="padding:9px 0;border-bottom:1px solid #f0eefb;">
  <a href="${escapeHtml(abs(baseUrl, it.href))}" style="${font}font-size:14px;font-weight:600;color:#1d1b3a;text-decoration:none;">
    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${TONE_COLOR[it.tone ?? "brand"]};margin-right:8px;"></span>${escapeHtml(it.label)}
  </a>
  ${it.meta ? `<div style="${font}font-size:12px;color:#6b6889;margin:2px 0 0 16px;">${escapeHtml(it.meta)}</div>` : ""}
</td></tr>`,
            )
            .join("")
        : `<tr><td style="${font}font-size:13px;color:#059669;padding:8px 0;">${escapeHtml(s.note ?? "All clear here.")}</td></tr>`;
      const more = s.more
        ? `<tr><td style="padding-top:8px;"><a href="${escapeHtml(abs(baseUrl, s.href ?? "/"))}" style="${font}font-size:12px;font-weight:700;color:#6d5df6;text-decoration:none;">+${s.more} more →</a></td></tr>`
        : "";
      return `<tr><td style="padding:18px 24px 6px;">
  <div style="${font}font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6d5df6;margin-bottom:4px;">${escapeHtml(s.heading)}</div>
  ${s.items.length && s.note ? `<div style="${font}font-size:12px;color:#6b6889;margin-bottom:4px;">${escapeHtml(s.note)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}${more}</table>
</td></tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(b.title)}</title></head>
<body style="margin:0;padding:0;background:#f1f0fb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f0fb;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 12px 32px -16px rgba(60,40,160,.35);">
  <tr><td style="background:#6d5df6;background-image:linear-gradient(135deg,#6d5df6 0%,#4f7cff 60%,#22c1a3 100%);padding:28px 24px;">
    <div style="${font}font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.8);">Command Center</div>
    <div style="${font}font-size:24px;font-weight:800;color:#ffffff;margin-top:6px;">${escapeHtml(b.title)}</div>
    <div style="${font}font-size:14px;color:rgba(255,255,255,.88);margin-top:6px;">${escapeHtml(b.subtitle)}</div>
  </td></tr>
  ${statRows.length ? `<tr><td style="padding:16px 18px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${statRows.join("")}</table></td></tr>` : ""}
  ${sections}
  <tr><td style="padding:22px 24px 26px;" align="center">
    <a href="${escapeHtml(abs(baseUrl, "/"))}" style="${font}display:inline-block;background:#6d5df6;background-image:linear-gradient(135deg,#6d5df6,#4f7cff);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:12px;">Open Command Center</a>
    <div style="${font}font-size:13px;color:#6b6889;margin-top:16px;">${escapeHtml(b.footer)}</div>
  </td></tr>
</table>
<div style="${font}font-size:11px;color:#9a97b5;margin-top:14px;">You get this because email alerts are on in Settings.</div>
</td></tr></table>
</body></html>`;

  const text = [
    b.title,
    b.subtitle,
    "",
    ...b.stats.map((s) => `${s.label}: ${s.value}${s.sub ? ` (${s.sub})` : ""}`),
    "",
    ...b.sections.flatMap((s) => [
      s.heading.toUpperCase(),
      ...(s.items.length ? s.items.map((i) => `- ${i.label}${i.meta ? ` — ${i.meta}` : ""}`) : [s.note ?? "All clear here."]),
      ...(s.more ? [`+${s.more} more`] : []),
      "",
    ]),
    b.footer,
    abs(baseUrl, "/"),
  ].join("\n");

  return { subject: b.title, html, text };
}

/** Plain-text body for the in-app notification (sections summarised). */
export function briefingNotificationBody(b: Briefing): string {
  const lines = [b.summary];
  for (const s of b.sections) {
    if (!s.items.length) continue;
    lines.push(`${s.heading}: ${s.items.length + (s.more ?? 0)}`);
  }
  return lines.join("\n");
}

/** Keeps the first n items and records how many were left out. */
export function take(items: BriefingItem[], n: number): Pick<BriefingSection, "items" | "more"> {
  return { items: items.slice(0, n), more: items.length > n ? items.length - n : undefined };
}
