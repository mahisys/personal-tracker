import { NextResponse } from "next/server";
import { runAutomations } from "@/server/automations/engine";
import { secretMatches } from "@/server/automations/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The digest may send an email and pushes; give it room.
export const maxDuration = 120;

/**
 * Runs all automations. Called by Cloud Scheduler every 15 minutes with the header `x-cron-secret`.
 * 503 when CRON_SECRET is not configured, 401 when the header is missing or wrong.
 */
async function handle(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "Cron is not configured (CRON_SECRET unset)" }, { status: 503 });
  if (!secretMatches(req.headers.get("x-cron-secret"), expected)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const url = new URL(req.url);
  const trigger = url.searchParams.get("trigger") === "manual" ? "manual" : "cron";
  try {
    const summary = await runAutomations({ trigger });
    return NextResponse.json(summary, { status: summary.ok ? 200 : 207 });
  } catch (e) {
    console.error("[cron] run failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
