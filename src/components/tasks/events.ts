"use client";
import { toast } from "sonner";
import { celebrate } from "@/components/client/celebrate";
import type { Overrun } from "@/server/tasks/core";

/**
 * Tiny client event bus so any completion checkbox or timer button can ask the single
 * <OverrunPrompt> on the page to offer an estimate revision.
 */
const EVENT = "cc:task-overrun";

export function emitOverrun(o: Overrun | null | undefined) {
  if (!o || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Overrun>(EVENT, { detail: o }));
}

export function onOverrun(fn: (o: Overrun) => void) {
  const h = (e: Event) => fn((e as CustomEvent<Overrun>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** Handles a TaskActionResult the same way everywhere: toast, confetti, overrun prompt. */
export function handleResult(r: { ok: boolean; error?: string; message?: string; celebrate?: boolean; overrun?: Overrun | null }) {
  if (!r.ok) {
    toast.error(r.error ?? "Something went wrong — try again");
    return false;
  }
  if (r.message) toast.success(r.message);
  if (r.celebrate) celebrate();
  if (r.overrun) setTimeout(() => emitOverrun(r.overrun), r.celebrate ? 900 : 200);
  return true;
}
