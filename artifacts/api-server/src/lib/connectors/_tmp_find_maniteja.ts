// One-off lookup (2026-10-05): user wants to manually map "Mani Teja
// Jinkala" (instructorArchiveTable id=110, currently inDarwin=false,
// inDarwinFullRoster=false, inTeachos=false, classification=null,
// deptBucket=tech -- meaning he WAS a real Darwin tech instructor at some
// point, per the sticky deptBucket field, but has since dropped out of
// every current sync source entirely) to a Darwin employee_id.
//
// Before asking the user to supply an employee_id by hand, check whether
// he already exists somewhere in the raw synced Darwin/TeachOS data under
// a slightly different name (spacing/case/typo) that the normalize()-based
// matching in reconcile.ts just isn't catching -- that would let us fix
// this as a straightforward match instead of a manual override.
import { db, instructorsTable, instructorArchiveTable, darwinboxFullRosterTable, darwinboxExitsTable, teachosIdReferenceTable, teachosDeploymentTable } from "@workspace/db";
import { ilike, or } from "drizzle-orm";

async function main() {
  console.log("=== Live instructorsTable row(s) matching 'Mani Teja' / 'Jinkala' ===");
  const live = await db.select().from(instructorsTable).where(or(ilike(instructorsTable.fullName, "%mani teja%"), ilike(instructorsTable.fullName, "%jinkala%")));
  for (const r of live) console.log(`  id=${r.id} employee_id=${r.employeeId} teachos_user_id=${r.teachosUserId} name="${r.fullName}" inDarwin=${r.inDarwin} inTeachos=${r.inTeachos} classification=${r.classification} deptBucket=${r.deptBucket}`);
  if (live.length === 0) console.log("  (none)");

  console.log("\n=== instructorArchiveTable row(s) matching 'Mani Teja' / 'Jinkala' ===");
  const archived = await db.select().from(instructorArchiveTable).where(or(ilike(instructorArchiveTable.fullName, "%mani teja%"), ilike(instructorArchiveTable.fullName, "%jinkala%")));
  for (const r of archived) console.log(`  id=${r.id} employee_id=${r.employeeId} teachos_user_id=${r.teachosUserId} name="${r.fullName}" inDarwin=${r.inDarwin} inTeachos=${r.inTeachos} classification=${r.classification} deptBucket=${r.deptBucket} exitFlag=${r.exitFlag} exitFlagDate=${r.exitFlagDate}`);
  if (archived.length === 0) console.log("  (none)");

  console.log("\n=== darwinboxFullRosterTable (broad ~3000+ person company export) matching 'Mani Teja' / 'Jinkala' ===");
  const fullRoster = await db.select().from(darwinboxFullRosterTable).where(or(ilike(darwinboxFullRosterTable.fullName, "%mani teja%"), ilike(darwinboxFullRosterTable.fullName, "%jinkala%")));
  for (const r of fullRoster) console.log(`  employee_id=${r.employeeId} name="${r.fullName}" synced_at=${r.syncedAt}`);
  if (fullRoster.length === 0) console.log("  (none -- he's not in the current Darwin export at all, broad or narrow)");

  console.log("\n=== darwinboxExitsTable (exit records) matching 'Mani Teja' / 'Jinkala' ===");
  const exits = await db.select().from(darwinboxExitsTable).where(or(ilike(darwinboxExitsTable.fullName, "%mani teja%"), ilike(darwinboxExitsTable.fullName, "%jinkala%")));
  for (const r of exits) console.log(`  employee_id=${r.employeeId} name="${r.fullName}" synced_at=${r.syncedAt} raw_data=${JSON.stringify(r.rawData).slice(0, 300)}`);
  if (exits.length === 0) console.log("  (none -- no Darwinbox exit record filed for him either)");

  console.log("\n=== teachosIdReferenceTable (manual instructor_user_id -> employee_id bridge) matching 'Mani Teja' / 'Jinkala' ===");
  const idRef = await db.select().from(teachosIdReferenceTable).where(or(ilike(teachosIdReferenceTable.fullName, "%mani teja%"), ilike(teachosIdReferenceTable.fullName, "%jinkala%")));
  for (const r of idRef) console.log(`  instructor_user_id=${r.instructorUserId} employee_id=${r.employeeId} name="${r.fullName}"`);
  if (idRef.length === 0) console.log("  (none -- no existing manual bridge entry for him)");

  console.log("\n=== teachosDeploymentTable (raw TeachOS deployment feed) matching 'Mani Teja' / 'Jinkala' ===");
  const deployment = await db.select().from(teachosDeploymentTable).where(ilike(teachosDeploymentTable.instructorName, "%mani%teja%"));
  for (const r of deployment) console.log(`  instructor_user_id=${r.instructorUserId} name="${r.instructorName}"`);
  if (deployment.length === 0) console.log("  (none found by that pattern)");
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
