// One-off lookup (2026-10-05): print full_name + enrolled_plans from the
// live instructorsTable for a batch of employee_ids asked about in
// conversation: NW0005068, NW0001087, NW0003442.
import { db, instructorsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const EMPLOYEE_IDS = ["NW0005068", "NW0001087", "NW0003442"];

async function main() {
  const rows = await db.select({ fullName: instructorsTable.fullName, employeeId: instructorsTable.employeeId, enrolledPlans: instructorsTable.enrolledPlans }).from(instructorsTable).where(inArray(instructorsTable.employeeId, EMPLOYEE_IDS));
  const byId = new Map(rows.map((r) => [r.employeeId, r]));

  for (const id of EMPLOYEE_IDS) {
    console.log(`=== ${id} ===`);
    const row = byId.get(id);
    if (!row) {
      console.log("  NOT FOUND -- no row for this employee_id in the live instructors table.");
    } else {
      console.log("  Name:", row.fullName);
      console.log("  Enrolled Plans:");
      console.log("   ", (row.enrolledPlans ?? "(null/empty)").replaceAll("\n", "\n    "));
    }
    console.log("");
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
