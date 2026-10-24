// SEPARATE CACHE DATABASE for the Instructor Archive (2026-10-24, per request: "create a cache database to save our instructor archive
// data"). A second Postgres database (its own Neon project/database), set with the ARCHIVE_CACHE_DATABASE_URL secret, that holds a copy
// of the Archive outside the main database -- so the Archive survives even if the main database is reset, restored or damaged.
//
// What is copied (each refresh):
//   archive_cache_current  -- the Archive exactly as the page shows it (one row per person: status, exit dates, payroll, gender, campus,
//                             Capability Manager...), REPLACED every refresh.
//   archive_cache_raw      -- every raw instructor_archive row (all stored fields), REPLACED every refresh.
//   archive_cache_history  -- the day's copy of archive_cache_current, KEPT: one set per IST day, so any past day can be looked up.
// Tables are created automatically on first use (no DB push needed for the cache database).
// When it runs: after the 5 AM daily sync (lib/scheduler.ts), and on demand with
//   pnpm exec tsx src/lib/connectors/_tmp_archive_cache_refresh.ts
// If ARCHIVE_CACHE_DATABASE_URL is not set, it does nothing.
import { PgPool, db, instructorArchiveTable } from "@workspace/db";
import { logger } from "./logger";

type Pool = InstanceType<typeof PgPool>;
let pool: Pool | null = null;
function cachePool(): Pool | null {
  const url = process.env.ARCHIVE_CACHE_DATABASE_URL;
  if (!url) return null;
  if (!pool) pool = new PgPool({ connectionString: url, max: 2 });
  return pool;
}

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

async function ensureTables(p: Pool) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS archive_cache_current (
      employee_id text, full_name text NOT NULL, status text, record jsonb NOT NULL, cached_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS archive_cache_raw (
      archive_id integer, employee_id text, full_name text, record jsonb NOT NULL, cached_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS archive_cache_history (
      snapshot_date date NOT NULL, employee_id text, full_name text NOT NULL, status text, record jsonb NOT NULL,
      cached_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS archive_cache_history_date_idx ON archive_cache_history (snapshot_date);
    CREATE INDEX IF NOT EXISTS archive_cache_history_emp_idx ON archive_cache_history (employee_id);
  `);
}

export type ArchiveCacheResult = { ok: boolean; skipped?: string; people?: number; raw?: number; snapshot_date?: string; error?: string };

export async function refreshArchiveCache(): Promise<ArchiveCacheResult> {
  const p = cachePool();
  if (!p) return { ok: false, skipped: "ARCHIVE_CACHE_DATABASE_URL is not set" };
  try {
    // The Archive as the page shows it (loaded lazily: routes/reports imports a lot) and the raw stored rows.
    const { loadArchivePeople } = await import("../routes/reports");
    const people = await loadArchivePeople();
    const raw = await db.select().from(instructorArchiveTable);
    const today = istToday();
    await ensureTables(p);
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM archive_cache_current");
      await client.query(
        `INSERT INTO archive_cache_current (employee_id, full_name, status, record)
         SELECT x->>'employee_id', x->>'full_name', x->>'status', x FROM jsonb_array_elements($1::jsonb) x`,
        [JSON.stringify(people)],
      );
      await client.query("DELETE FROM archive_cache_raw");
      await client.query(
        `INSERT INTO archive_cache_raw (archive_id, employee_id, full_name, record)
         SELECT (x->>'id')::integer, x->>'employeeId', x->>'fullName', x FROM jsonb_array_elements($1::jsonb) x`,
        [JSON.stringify(raw)],
      );
      await client.query("DELETE FROM archive_cache_history WHERE snapshot_date = $1", [today]);
      await client.query(
        `INSERT INTO archive_cache_history (snapshot_date, employee_id, full_name, status, record)
         SELECT $1::date, employee_id, full_name, status, record FROM archive_cache_current`,
        [today],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    logger.info({ people: people.length, raw: raw.length, today }, "Archive cache refreshed");
    return { ok: true, people: people.length, raw: raw.length, snapshot_date: today };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// What is in the cache database right now (for the refresh script and checks).
export async function archiveCacheStatus() {
  const p = cachePool();
  if (!p) return null;
  await ensureTables(p);
  const { rows } = await p.query(`
    SELECT (SELECT count(*) FROM archive_cache_current)::int AS current_rows,
           (SELECT max(cached_at) FROM archive_cache_current) AS last_refresh,
           (SELECT count(*) FROM archive_cache_raw)::int AS raw_rows,
           (SELECT count(DISTINCT snapshot_date) FROM archive_cache_history)::int AS history_days,
           (SELECT min(snapshot_date)::text FROM archive_cache_history) AS first_day`);
  return rows[0];
}
