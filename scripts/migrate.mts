/**
 * Applies pending migrations, then the idempotent seed. Runs at every container start (see Dockerfile),
 * bundled to dist/migrate.mjs; locally: `npm run db:migrate`.
 * Usage: tsx scripts/migrate.mts [--seed-only]
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { seed } from "../src/db/seed";
import { connectionConfig } from "../src/db/connection";

const { url, options } = connectionConfig();
const client = postgres(url, { ...options, max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });
try {
  if (!process.argv.includes("--seed-only")) {
    await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle") });
    console.log("Migrations applied");
  }
  await seed(db);
  console.log("Seed complete");
} finally {
  await client.end();
}
