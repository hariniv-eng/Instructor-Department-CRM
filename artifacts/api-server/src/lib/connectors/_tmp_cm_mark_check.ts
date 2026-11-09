// One-off, READ-ONLY (2026-11-09, per request: "3rd time I am marking NW2000452 as Payroll Converted, after every sync he is back in CM
// actions"). The only code that clears a Capability Manager's mark is recomputeStatuses() in lib/reconcile.ts: it sets Employee Status
// back to empty when the person HAS an exit record now but exit_flag was false before the recompute ("exit record newly appeared").
// So this prints, for one employee ID, everything that decides that -- no names:
//   1. every instructors row with this employee ID (duplicates would explain it too) and its exit flag / status / Employee Status
//   2. the Instructor Archive row(s)
//   3. every stored Darwin exit record mentioning the ID, with the employee id it is stored under (null / different spelling = the record
//      is not matched to him, so his exit flag drops to false, and the next sync that finds it again clears the mark)
//   4. the last 12 exit-list syncs (row counts) -- a sync that stored far fewer rows points to a partial pull
//   pnpm exec tsx src/lib/connectors/_tmp_cm_mark_check.ts NW2000452
import { sql, desc, eq } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable, uploadsTable } from "@workspace/db";

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  const rows = await db.select().from(instructorsTable).where(sql`UPPER(TRIM(${instructorsTable.employeeId})) = ${emp}`);
  console.log(`1. instructors rows for ${emp}: ${rows.length}`);
  for (const r of rows) console.log(`   id ${r.id} | employee id "${r.employeeId}" | in Darwin ${r.inDarwin} | in TeachOS ${r.inTeachos} | classification ${r.classification} | exit flag ${r.exitFlag} | exit status ${r.exitFlagStatus} | exit date ${r.exitFlagDate} | Employee Status (CM mark) ${r.exitVerification ?? "(empty)"}`);
  const uids = rows.map((r) => r.teachosUserId).filter((u): u is string => !!u);
  for (const u of uids) {
    const same = await db.select({ id: instructorsTable.id, e: instructorsTable.employeeId, v: instructorsTable.exitVerification }).from(instructorsTable).where(eq(instructorsTable.teachosUserId, u));
    if (same.length > 1) console.log(`   !! ${same.length} rows share this person's TeachOS id: ${same.map((s) => `id ${s.id} (employee id "${s.e}", mark ${s.v ?? "empty"})`).join("; ")}`);
  }

  const arch = await db.select().from(instructorArchiveTable).where(sql`UPPER(TRIM(${instructorArchiveTable.employeeId})) = ${emp}`);
  console.log(`\n2. archive rows: ${arch.length}${arch.map((a) => ` | Employee Status ${a.exitVerification ?? "(empty)"}`).join("")}`);

  const exits = await db.select().from(darwinboxExitsTable).where(sql`${darwinboxExitsTable.rawData}::text ILIKE ${"%" + emp + "%"} OR UPPER(TRIM(${darwinboxExitsTable.employeeId})) = ${emp}`);
  console.log(`\n3. stored Darwin exit records mentioning ${emp}: ${exits.length}`);
  for (const x of exits) {
    const raw = x.rawData as Record<string, unknown>;
    const keys = Object.keys(raw).filter((k) => String(raw[k] ?? "").toUpperCase().includes(emp));
    console.log(`   id ${x.id} | stored under employee id "${x.employeeId}" | Status ${raw["Status"] ?? raw["status"] ?? "-"} | Exit Date ${raw["Exit Date"] ?? "-"} | Source ${raw["Exit Source"] ?? "-"} | ID found in field(s): ${keys.join(", ")} | synced ${x.syncedAt.toISOString()}`);
  }

  const ups = await db.select().from(uploadsTable).where(eq(uploadsTable.source, "Exit List")).orderBy(desc(uploadsTable.uploadedAt)).limit(12);
  console.log(`\n4. last exit-list syncs (time | rows stored | detail):`);
  for (const u of ups) console.log(`   ${u.uploadedAt.toISOString()} | ${u.rowCount} | ${u.filename.replace(/^Darwinbox reports-API sync \(raw, flagged only\)\s*/, "")}`);
  const changes = await db.select().from(uploadsTable).where(sql`${uploadsTable.source} = 'Employee Status change' AND UPPER(${uploadsTable.filename}) LIKE ${emp + ":%"}`).orderBy(desc(uploadsTable.uploadedAt)).limit(30);
  console.log(`\n5. Employee Status changes logged for ${emp} (logging starts 2026-11-09; newest first): ${changes.length}`);
  for (const c of changes) console.log(`   ${c.uploadedAt.toISOString()} | ${c.filename}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
