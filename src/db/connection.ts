import type { Options } from "postgres";

export const DEFAULT_DATABASE_URL = "postgres://postgres@localhost:5432/command_center";

/**
 * Splits DATABASE_URL into a URL + options for postgres.js. Supports the Cloud SQL unix socket form
 * `postgres://user:pass@localhost/db?host=/cloudsql/<connection-name>`, which postgres.js does not read from the URL itself.
 */
export function connectionConfig(raw: string = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): { url: string; options: Options<Record<string, never>> } {
  const u = new URL(raw);
  const socketDir = u.searchParams.get("host");
  if (socketDir && socketDir.startsWith("/")) {
    u.searchParams.delete("host");
    return { url: u.toString(), options: { host: socketDir } };
  }
  return { url: raw, options: {} };
}
