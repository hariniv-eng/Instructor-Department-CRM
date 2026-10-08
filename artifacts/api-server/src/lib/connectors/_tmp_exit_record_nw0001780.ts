// One-off lookup (2026-10-07): print every darwin_exits record stored for
// employee NW0001780, with ALL of its raw fields (so the "Date Of Exit" column
// and the "Exit Date" column can be compared), plus the live row's stored dates.
import { db, darwinboxExitsTable, instructorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ID = process.argv[2] ?? "NW0001780";

async function main() {
  const exits = await db.select().from(darwinboxExitsTable).where(eq(darwinboxExitsTable.employeeId, ID));
  console.log(`darwin_exits records for ${ID}: ${exits.length}`);
  for (const e of exits) {
    console.log(`--- record id ${e.id} (synced ${e.syncedAt.toISOString()})`);
    for (const [key, value] of Object.entries(e.rawData)) console.log(`  ${key}: ${value === null || value === "" ? "(blank)" : String(value)}`);
  }
  const [row] = await db.select({ fullName: instructorsTable.fullName, exitFlag: instructorsTable.exitFlag, exitFlagStatus: instructorsTable.exitFlagStatus, exitFlagDate: instructorsTable.exitFlagDate, exitLastWorkingDate: instructorsTable.exitLastWorkingDate, exitVerification: instructorsTable.exitVerification }).from(instructorsTable).where(eq(instructorsTable.employeeId, ID));
  console.log("Live row:", row ?? "NOT FOUND");
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
