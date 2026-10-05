// One-off diagnostic (2026-10-05): why does employee_id NW0001087 show up
// in the Instructor Archive but not on the live Instructors tab? Pulls
// their row from BOTH instructorsTable (live) and instructorArchiveTable
// (archive), prints every field that feeds the department/category
// classification, and re-runs both the live "department" filter
// (computeDepartmentAndExceptionRows in reports.ts) and the archive's own
// filter (GET /reports/instructor-archive in reports.ts) against just this
// one person, to show exactly which bucket (if any) they land in on each
// side.
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function classify(r: { inDarwin: boolean; inDarwinFullRoster: boolean; inTeachos: boolean; classification: string | null; deptBucket: string | null }) {
  const isDarwinInstructor = r.inDarwin && !r.inDarwinFullRoster && !r.classification && (r.deptBucket === "tech" || r.deptBucket === "non_tech");
  const isTeachosOnly = r.inTeachos && !r.inDarwin;
  const isPayrollConverted = isTeachosOnly && r.classification === "payroll_converted";
  const isNeedsReview = isTeachosOnly
    && r.classification !== "excluded_other_department"
    && r.classification !== "excluded_non_department_team"
    && r.classification !== "iit_kharagpur_team"
    && r.classification !== "payroll_converted";
  const isMentor = r.inDarwin && !r.inDarwinFullRoster && r.classification === "mentor";
  const isOpsTeam = r.classification === "excluded_ops_managers";
  const buckets = [
    isDarwinInstructor && "darwinInstructors (-> Instructors tab)",
    isPayrollConverted && "payrollConverted (-> Instructors tab, TeachOS-only)",
    isNeedsReview && "needsReview (-> Instructors tab, Needs Review / Exception)",
    isMentor && "mentors (-> Mentors tab)",
    isOpsTeam && "opsTeamRows (-> Ops team tab)",
  ].filter(Boolean);
  return buckets.length > 0 ? buckets : ["NONE -- excluded from every department-rollup bucket"];
}

async function main() {
  const [live] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, "NW0001087"));
  const [archive] = await db.select().from(instructorArchiveTable).where(eq(instructorArchiveTable.employeeId, "NW0001087"));

  console.log("=== LIVE instructorsTable row ===");
  if (!live) {
    console.log("  NOT FOUND -- this employee_id has no row at all in the live instructors table.");
  } else {
    console.log("  id:", live.id);
    console.log("  fullName:", live.fullName);
    console.log("  employeeId:", live.employeeId);
    console.log("  teachosUserId:", live.teachosUserId);
    console.log("  inDarwin:", live.inDarwin, " inDarwinFullRoster:", live.inDarwinFullRoster, " inTeachos:", live.inTeachos);
    console.log("  deptBucket:", live.deptBucket, " classification:", live.classification, " classificationReason:", live.classificationReason);
    console.log("  computedStatus:", live.computedStatus);
    console.log("  exitFlag:", live.exitFlag, " exitFlagStatus:", live.exitFlagStatus, " exitFlagDate:", live.exitFlagDate);
    console.log("  deploymentStatus:", live.deploymentStatus);
    console.log("  -> category bucket(s) on LIVE data:", classify(live).join(", "));
  }

  console.log("\n=== ARCHIVE instructorArchiveTable row ===");
  if (!archive) {
    console.log("  NOT FOUND -- no archive row either (unexpected, since the user says this person IS visible there).");
  } else {
    console.log("  id:", archive.id);
    console.log("  fullName:", archive.fullName);
    console.log("  employeeId:", archive.employeeId);
    console.log("  teachosUserId:", archive.teachosUserId);
    console.log("  inDarwin:", archive.inDarwin, " inDarwinFullRoster:", archive.inDarwinFullRoster, " inTeachos:", archive.inTeachos);
    console.log("  deptBucket:", archive.deptBucket, " classification:", archive.classification, " classificationReason:", archive.classificationReason);
    console.log("  exitFlag:", archive.exitFlag, " exitFlagStatus:", archive.exitFlagStatus, " exitFlagDate:", archive.exitFlagDate, " exitDate (manual/legacy):", archive.exitDate);
    console.log("  deploymentStatus:", archive.deploymentStatus);
    console.log("  firstSeenAt:", archive.firstSeenAt, " lastSyncedAt:", archive.lastSyncedAt);
    console.log("  -> category bucket(s) on ARCHIVE data:", classify(archive).join(", "));
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
