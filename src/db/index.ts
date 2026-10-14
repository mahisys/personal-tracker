import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { connectionConfig } from "./connection";

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

function createClient() {
  // On Cloud Run, DATABASE_URL points at the Cloud SQL unix socket (see connection.ts).
  const { url, options } = connectionConfig();
  return postgres(url, { ...options, max: Number(process.env.DB_POOL_MAX ?? 5), idle_timeout: 30 });
}

const client = globalForDb.sql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.sql = client;

export const db = drizzle(client, { schema, casing: undefined });
export type DB = typeof db;
/** A transaction handle has the same query API as db */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;
export { schema };
