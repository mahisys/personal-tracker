import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

function createClient() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/command_center";
  // On Cloud Run, DATABASE_URL points at the Cloud SQL unix socket: postgres://user:pass@/db?host=/cloudsql/<conn>
  return postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 5), idle_timeout: 30 });
}

const client = globalForDb.sql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.sql = client;

export const db = drizzle(client, { schema, casing: undefined });
export type DB = typeof db;
/** A transaction handle has the same query API as db */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;
export { schema };
