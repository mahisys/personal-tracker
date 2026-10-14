import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time comparison of the cron secret (hashing first makes the lengths equal). */
export function secretMatches(given: string | null | undefined, expected: string): boolean {
  if (!given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
