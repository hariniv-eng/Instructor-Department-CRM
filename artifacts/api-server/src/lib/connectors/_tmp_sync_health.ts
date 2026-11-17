// One-off (2026-11-17, per report: "Darwin Exits / TeachOS / Training Stats / Contribution have not synced since the last 5:00 AM IST
// run"). READ-ONLY unless --release is given.
//   1. Is the sync lock (Postgres advisory lock 8420011, lib/syncContext.ts) held right now, by which connection, since when, doing what?
//      If it is held while no sync is running, every 5am / catch-up / Sync Now run is skipped as "already running".
//   2. Every uploads-table entry since yesterday 00:00 IST (successful syncs AND "... FAILED" entries with their error).
//   --release: ends the connection that holds the lock (only that one), so the next sync can run.
//   pnpm exec tsx src/lib/connectors/_tmp_sync_health.ts [--release]
import { gte, desc } from "drizzle-orm";
import { db, pool, uploadsTable } from "@workspace/db";

async function main() {
  const release = process.argv.includes("--release");
  const { rows: locks } = await pool.query(`
    SELECT l.pid, l.granted, a.state, a.backend_start, a.xact_start, a.query_start, a.state_change, a.application_name, LEFT(a.query, 160) AS query
    FROM pg_locks l LEFT JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE l.locktype = 'advisory' AND l.objid = 8420011`);
  console.log(`1. Sync lock: ${locks.length ? "HELD" : "free"}`);
  for (const l of locks) console.log(`   pid ${l.pid} granted ${l.granted} | state ${l.state} | connected ${l.backend_start?.toISOString?.() ?? l.backend_start} | last query at ${l.query_start?.toISOString?.() ?? l.query_start} | state since ${l.state_change?.toISOString?.() ?? l.state_change}\n     last query: ${l.query}`);
  const { rows: active } = await pool.query(`SELECT pid, state, query_start, LEFT(query, 120) AS query FROM pg_stat_activity WHERE datname = current_database() AND state <> 'idle' AND pid <> pg_backend_pid() ORDER BY query_start`);
  console.log(`   other busy connections on this database: ${active.length}`);
  for (const a of active) console.log(`   pid ${a.pid} ${a.state} since ${a.query_start?.toISOString?.() ?? a.query_start}: ${a.query}`);

  const since = new Date(Date.now() - 48 * 3600 * 1000);
  const ups = await db.select().from(uploadsTable).where(gte(uploadsTable.uploadedAt, since)).orderBy(desc(uploadsTable.uploadedAt));
  console.log(`\n2. Sync / upload entries in the last 48 hours (${ups.length}), newest first (IST):`);
  for (const u of ups) console.log(`   ${new Date(u.uploadedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} | ${u.source} | rows ${u.rowCount} | ${String(u.filename ?? "").slice(0, 220)}`);

  if (release) {
    for (const l of locks.filter((x) => x.granted)) {
      const { rows } = await pool.query("SELECT pg_terminate_backend($1) AS ok", [l.pid]);
      console.log(`\n--release: ended connection ${l.pid}: ${rows[0]?.ok}`);
    }
    if (!locks.length) console.log("\n--release: nothing to release, the lock is free");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
