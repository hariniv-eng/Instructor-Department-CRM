// One-off, READ-ONLY (2026-10-13): who holds the sync advisory lock (key 8420011, see lib/syncContext.ts), and for how
// long, plus the latest successful sync per source. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_sync_lock_holder.ts
import { pool } from "@workspace/db";

async function main() {
  const locks = await pool.query(`
    select l.pid, a.state, a.application_name, a.backend_start, a.state_change, a.xact_start, left(a.query, 90) as last_query,
           now() - a.state_change as idle_or_running_for
    from pg_locks l left join pg_stat_activity a on a.pid = l.pid
    where l.locktype = 'advisory' and l.granted and ((l.classid::bigint << 32) | l.objid::bigint) = 8420011`);
  console.log(`Sync lock holders: ${locks.rowCount}`);
  for (const r of locks.rows) console.log(r);
  const last = await pool.query(`select source, max(uploaded_at) as last_success from uploads group by source order by source`);
  console.log("\nLatest recorded sync per source:");
  for (const r of last.rows) console.log(`${r.source}\t${new Date(r.last_success).toISOString()}`);
  console.log(`\nNow: ${new Date().toISOString()}`);
  console.log("Reading: state 'idle' and a long idle_or_running_for = a leaked lock (nothing is running). state 'active' = a real sync is running.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
