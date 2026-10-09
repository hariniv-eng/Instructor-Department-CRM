// One-off (2026-10-08): who holds the sync lock (advisory key 8420011) and for how long. Read-only.
import { pool } from "@workspace/db";

async function main() {
  const { rows } = await pool.query(`
    select l.pid, a.state, a.application_name, now() - a.backend_start as connected_for,
           now() - a.state_change as in_state_for, now() - a.xact_start as xact_age, left(a.query, 120) as last_query
    from pg_locks l join pg_stat_activity a on a.pid = l.pid
    where l.locktype = 'advisory' and l.objid = 8420011 and l.granted`);
  console.log(rows.length ? rows : "Nobody holds the sync lock right now.");
  const { rows: up } = await pool.query(`select source, uploaded_at at time zone 'Asia/Kolkata' as ist from uploads order by uploaded_at desc limit 8`);
  console.log("\nLatest sync records (IST):"); for (const r of up) console.log(`  ${r.ist.toISOString?.() ?? r.ist} | ${r.source}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
