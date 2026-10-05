// One-off diagnostic (2026-10-05): why is employee_id NW0005221 not
// included in the final instructor count? Pulls their full live
// instructorsTable row, prints every field that feeds classification
// (inDarwin/inDarwinFullRoster/inTeachos/classification/classificationReason/
// deptBucket/exitFlag/computedStatus), and re-runs the exact same
// department/category classification used by computeDepartmentAndExceptionRows
// in reports.ts (the function behind both the Overview KPIs and the
// Instructors tab's category tabs) against just this one person, to show
// exactly which bucket (if any) they land in, or why they're excluded from
// all of them.
import { db, instructorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const [row] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, "NW0005221"));

  if (!row) {
    console.log("NOT FOUND -- no row at all in the live instructors table for employee_id NW0005221.");
    console.log("This alone would explain why they're missing from every count -- check whether they exist under a different employee_id, or only by teachos_user_id/name.");
    return;
  }

  console.log("=== Full live instructorsTable row for NW0005221 ===");
  for (const [key, value] of Object.entries(row)) {
    console.log(`  ${key}:`, value);
  }

  console.log("\n=== Classification walkthrough (mirrors computeDepartmentAndExceptionRows in reports.ts) ===");
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
  console.log("  deptBucket:", deptBucket);
  console.log("  isDarwinInstructor (-> Instructors tab, 'department' count):", isDarwinInstructor);
  console.log("  isTeachosOnly:", isTeachosOnly);
  console.log("  isPayrollConverted (-> Instructors tab, TeachOS-only):", isPayrollConverted);
  console.log("  isNeedsReview (-> Needs Review / Exception bucket):", isNeedsReview);
  console.log("  isMentor (-> Mentors tab):", isMentor);
  console.log("  isOpsTeam (-> Ops team tab):", isOpsTeam);

  const included = isDarwinInstructor || isPayrollConverted || isNeedsReview || isMentor || isOpsTeam;
  console.log("\n  => INCLUDED in department rollup:", included);
  if (!included) {
    console.log("  => EXCLUDED. Likely reason: inDarwinFullRoster is true (counted only in Darwin's full roster, not the department view), or classification is one of the explicitly-excluded values (excluded_other_department / excluded_non_department_team / iit_kharagpur_team) while NOT in TeachOS, or inDarwin/inTeachos are both false (person isn't matched to either source at all).");
  }

  console.log("\n=== Exit status ===");
  console.log("  exitFlag:", row.exitFlag, " exitFlagStatus:", row.exitFlagStatus, " exitFlagDate:", row.exitFlagDate);
  console.log("  computedStatus:", row.computedStatus, " deploymentStatus:", row.deploymentStatus);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
