/** What every server action used with <ActionForm> returns. */
export type ActionResult =
  | {
      ok?: boolean;
      error?: string;
      /** Toast shown on success */
      message?: string;
      /** Fire confetti — use for wins: task done, invoice paid, loan disbursed, lead won */
      celebrate?: boolean;
      /** Client navigates here after success */
      redirectTo?: string;
    }
  | undefined
  | void;

export function fail(error: string): ActionResult {
  return { ok: false, error };
}

export function done(message?: string, extra: Omit<NonNullable<Exclude<ActionResult, void>>, "ok" | "message"> = {}): ActionResult {
  return { ok: true, message, ...extra };
}

/** Reads a trimmed string field; empty becomes null. */
export function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function int(form: FormData, key: string): number | null {
  const s = str(form, key);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function day(form: FormData, key: string): string | null {
  const s = str(form, key);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
