import { sql } from "drizzle-orm";
import { db } from "@/db";
import { seed } from "@/db/seed";

/** Empties every table and re-seeds defaults. Call in beforeEach of DB tests. */
export async function resetDb() {
  const rows = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
  await seed(db as never);
}

/** Test stand-ins for next/cache and next/navigation used by server actions. */
export const nextMocks = {
  cache: () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: <T>(fn: T) => fn }),
};
