// One-off lookup (2026-10-05): print employee_id NW0001087's full_name and
// enrolled_plans field from the live instructorsTable (same lookup as the
// NW0005068 one, just for this employee_id).
import { db, instructorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const [row] = await db.select({ fullName: instructorsTable.fullName, employeeId: instructorsTable.employeeId, enrolledPlans: instructorsTable.enrolledPlans }).from(instructorsTable).where(eq(instructorsTable.employeeId, "NW0001087"));
  if (!row) {
    console.log("NOT FOUND -- no row for employee_id NW0001087 in the live instructors table.");
    return;
  }
  console.log("Name:", row.fullName);
  console.log("Employee ID:", row.employeeId);
  console.log("Enrolled Plans:");
  console.log(row.enrolledPlans ?? "(null/empty)");
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
