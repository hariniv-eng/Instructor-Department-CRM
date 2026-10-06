// One-off diagnostic (2026-10-05): full live instructorsTable row + the
// same classification walkthrough used for NW0005221/NW0007512 earlier,
// for employee_id NW0005068 (Saumya Sunil Patil) -- user wants her added
// to the Instructor Department as an Instructor; need to see her current
// classification/bucket and why she isn't already counted as one, before
// deciding the right fix (a data/sync issue vs. needing a manual override).
import { db, instructorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const [row] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, "NW0005068"));

  if (!row) {
    console.log("NOT FOUND -- no row at all in the live instructors table for employee_id NW0005068.");
    return;
  }

  console.log("=== Full live instructorsTable row for NW0005068 ===");
  for (const [key, value] of Object.entries(row)) {
    console.log(`  ${key}:`, value);
  }

  console.log("\n=== Classification walkthrough ===");
  const inDarwin = row.inDarwin;
  const inDarwinFullRoster = row.inDarwinFullRoster;
  const inTeachos = row.inTeachos;
  const classification = row.classification;
  const deptBucket = row.deptBucket;

  const isDarwinInstructor = inDarwin && !inDarwinFullRoster && !classification && (deptBucket === "tech" || deptBucket === "non_tech");
  const isTeachosOnly = inTeachos && !inDarwin;
  const isPayrollConverted = isTeachosOnly && classification === "payroll_converted";
  const isNeedsReview = isTeachosOnly
    && classification !== "excluded_other_department"
    && classification !== "excluded_non_department_team"
    && classification !== "iit_kharagpur_team"
    && classification !== "payroll_converted";
  const isMentor = inDarwin && !inDarwinFullRoster && classification === "mentor";
  const isOpsTeam = classification === "excluded_ops_managers";

  console.log("  inDarwin:", inDarwin, " inDarwinFullRoster:", inDarwinFullRoster, " inTeachos:", inTeachos);
  console.log("  classification:", classification, " classificationReason:", row.classificationReason);
  console.log("  deptBucket:", deptBucket, " deptArea:", row.deptArea);
  console.log("  department (raw Darwin):", row.department, " designation:", row.designation);
  console.log("  teachosCategory:", row.teachosCategory, " teachosRole:", row.teachosRole);
  console.log("  isDarwinInstructor (-> Instructors tab, counted):", isDarwinInstructor);
  console.log("  isTeachosOnly:", isTeachosOnly);
  console.log("  isPayrollConverted:", isPayrollConverted);
  console.log("  isNeedsReview:", isNeedsReview);
  console.log("  isMentor:", isMentor);
  console.log("  isOpsTeam:", isOpsTeam);
  const included = isDarwinInstructor || isPayrollConverted || isNeedsReview || isMentor || isOpsTeam;
  console.log("\n  => INCLUDED in department rollup at all:", included);
  console.log("  => Counted specifically as an ordinary Instructor (isDarwinInstructor OR isPayrollConverted):", isDarwinInstructor || isPayrollConverted);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
