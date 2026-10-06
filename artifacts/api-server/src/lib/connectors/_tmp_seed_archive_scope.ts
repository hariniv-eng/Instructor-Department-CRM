// One-off (2026-10-06): take the Instructor Archive baseline right now
// (marks everyone currently in the department as inArchiveScope) instead of
// waiting for the server's own seeding. Database-only, idempotent.
import { db, instructorArchiveTable } from "@workspace/db";
import { archiveInstructors } from "../archiveInstructors";

async function main() {
  const result = await archiveInstructors();
  console.log("archiveInstructors:", result);
  const rows = await db.select().from(instructorArchiveTable);
  const flagged = rows.filter((r) => r.inArchiveScope);
  const exited = flagged.filter((r) => r.exitFlagDate ?? r.exitDate);
  console.log(`Archive rows: ${rows.length}, flagged in scope: ${flagged.length}, of those with an exit date: ${exited.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
