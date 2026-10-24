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
export const db = drizzle(pool, { schema });
// The pg Pool class, for code that needs a connection to ANOTHER database (2026-10-24: the separate Instructor Archive cache database,
// see artifacts/api-server/src/lib/archiveCache.ts). Exported here because "pg" is a dependency of this package, not of the API server.
export const PgPool = Pool;

export * from "./schema";
