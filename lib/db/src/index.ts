import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Stuck transactions end on their own (2026-11-25): twice (20 and 25 Nov) a sync starved by Autoscale left a connection "idle in
// transaction" for hours, holding rows and blocking every later sync. Postgres now rolls back any transaction left idle for 15 minutes
// (a normal sync takes about a minute; nothing is saved from the rolled-back one, the next sync redoes it).
pool.on("connect", (client) => {
  client.query("SET idle_in_transaction_session_timeout = '15min'").catch(() => undefined);
});
export const db = drizzle(pool, { schema });
// The pg Pool class, for code that needs a connection to ANOTHER database (2026-10-24: the separate Instructor Archive cache database,
// see artifacts/api-server/src/lib/archiveCache.ts). Exported here because "pg" is a dependency of this package, not of the API server.
export const PgPool = Pool;

export * from "./schema";
