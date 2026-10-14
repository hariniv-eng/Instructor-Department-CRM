// One-off (2026-10-14): restores Darwin exit rows that were wiped from darwinbox_exits by an earlier sync, reading them from an
// OLDER copy of the database (a Neon point-in-time branch). Inserts ONLY employee ids that have NO row in the live table now, and
// (by default) only for people the app currently has as payroll_converted. PREVIEW by default: writes nothing. Add --apply to insert.
//
// Steps: in the Neon console create a branch of the production database from a time BEFORE the rows were lost (the earlier check
// showed they were last present before 12 Oct 11:41 UTC), copy that branch's connection string, then in the Replit shell:
//   export OLD_DATABASE_URL='postgresql://...branch connection string...'
//   cd artifacts/api-server
//   pnpm exec tsx src/lib/connectors/_tmp_restore_lost_exits.ts           # preview
//   pnpm exec tsx src/lib/connectors/_tmp_restore_lost_exits.ts --apply   # insert
//   add --all to restore every missing id (not just payroll-converted people)
import { db, pool, instructorsTable, darwinboxExitsTable } from "@workspace/db";

async function main() {
  const oldUrl = process.env.OLD_DATABASE_URL;
  if (!oldUrl) throw new Error("Set OLD_DATABASE_URL to the Neon branch connection string first.");
  if (oldUrl === process.env.DATABASE_URL) throw new Error("OLD_DATABASE_URL is the same as DATABASE_URL: it must be a separate older branch.");
  const apply = process.argv.includes("--apply");
  const all = process.argv.includes("--all");

  const OldPool = (pool as any).constructor as new (o: { connectionString: string }) => typeof pool;
  const old = new OldPool({ connectionString: oldUrl });
  const oldRes = await old.query("select employee_id, full_name, raw_data, synced_at from darwinbox_exits");
  console.log(`Old branch: ${oldRes.rows.length} exit rows.`);

  const cur = await db.select({ employeeId: darwinboxExitsTable.employeeId }).from(darwinboxExitsTable);
  const have = new Set(cur.map((r) => (r.employeeId ?? "").trim().toLowerCase()).filter(Boolean));
  console.log(`Live table now: ${cur.length} rows, ${have.size} distinct employee ids.`);

  const people = await db.select().from(instructorsTable);
  const payroll = new Set(people.filter((p) => p.employeeId && p.exitVerification === "payroll_converted").map((p) => p.employeeId!.trim().toLowerCase()));

  const missing = oldRes.rows.filter((r: any) => {
    const id = String(r.employee_id ?? "").trim().toLowerCase();
    return id && !have.has(id) && (all || payroll.has(id));
  });
  console.log(`\nRows in the old branch that are missing now${all ? "" : " (payroll-converted people only)"}: ${missing.length}`);
  for (const r of missing as any[]) {
    const raw = (r.raw_data ?? {}) as Record<string, unknown>;
    console.log(`${r.full_name} | ${r.employee_id} | status ${raw["Status"] ?? "-"} | exit date ${raw["Date Of Exit"] ?? raw["Exit Date"] ?? "-"} | requested ${raw["Date Of Resignation"] ?? raw["Separation Requested On"] ?? "-"}`);
  }

  if (!apply) { console.log("\nPreview only. Re-run with --apply to insert these rows."); await old.end(); process.exit(0); }
  if (!missing.length) { console.log("Nothing to insert."); await old.end(); process.exit(0); }

  const now = new Date();
  await db.insert(darwinboxExitsTable).values(
    (missing as any[]).map((r) => ({
      employeeId: r.employee_id as string,
      fullName: r.full_name as string | null,
      rawData: { ...(r.raw_data ?? {}), "Exit Source": "Restored from an earlier database copy" } as Record<string, unknown>,
      syncedAt: now,
    })),
  );
  console.log(`\nInserted ${missing.length} rows. The sync now carries over rows Darwin no longer returns, so they will stay.`);
  console.log("Run Sync Now on the exits source (or recompute) so the classification picks them up.");
  await old.end();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
