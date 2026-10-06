// One-off diagnostic (2026-10-05): user reports the Instructor Archive's
// "Exited" status count (27) looks far too low compared to how many
// payroll-converted / exited instructors exist overall. Hypothesis: the
// GET /reports/instructor-archive route (reports.ts ~line 1220) re-applies
// the SAME live-status department-membership filter
// (inDarwin/inTeachos/classification/deptBucket) to the ARCHIVE table rows
// that computeDepartmentAndExceptionRows() uses for the LIVE Instructors
// tab -- but archiveInstructors.ts overwrites inDarwin/inTeachos/
// classification on every sync to match the person's CURRENT live state.
// So once someone fully exits everywhere (inDarwin=false AND inTeachos=
// false on their archive row, because that's now their live state too),
// they fall out of darwinInstructors (needs inDarwin), teachosOnly-based
// payrollConverted/needsReview (needs inTeachos), and mentors (needs
// inDarwin) alike -- vanishing from the archive page's visible list
// entirely, even though their row is never deleted from
// instructorArchiveTable. This is the exact same class of bug fixed
// earlier this session for exceptionRows, but that fix never touched this
// separate archive route.
import { db, instructorArchiveTable } from "@workspace/db";

type ArchiveRow = typeof instructorArchiveTable.$inferSelect;

function departmentFilter(allRows: ArchiveRow[]) {
  const darwinInstructors = allRows.filter((r) => r.inDarwin && !r.inDarwinFullRoster && !r.classification && (r.deptBucket === "tech" || r.deptBucket === "non_tech"));
  const teachosOnly = allRows.filter((r) => r.inTeachos && !r.inDarwin);
  const payrollConverted = teachosOnly.filter((r) => r.classification === "payroll_converted");
  const needsReview = teachosOnly.filter((r) =>
    r.classification !== "excluded_other_department"
    && r.classification !== "excluded_non_department_team"
    && r.classification !== "iit_kharagpur_team"
    && r.classification !== "payroll_converted"
  );
  const mentors = allRows.filter((r) => r.inDarwin && !r.inDarwinFullRoster && r.classification === "mentor");
  const opsTeamRows = allRows.filter((r) => r.classification === "excluded_ops_managers");
  return { darwinInstructors, payrollConverted, needsReview, mentors, opsTeamRows, all: [...darwinInstructors, ...payrollConverted, ...needsReview, ...mentors, ...opsTeamRows] };
}

async function main() {
  const allArchiveRows = await db.select().from(instructorArchiveTable);
  console.log(`Total rows ever archived (instructorArchiveTable, never deleted): ${allArchiveRows.length}`);

  const dept = departmentFilter(allArchiveRows);
  console.log("\n=== What the Archive page's /reports/instructor-archive route currently shows ===");
  console.log("  darwinInstructors:", dept.darwinInstructors.length);
  console.log("  payrollConverted (teachos-only):", dept.payrollConverted.length);
  console.log("  needsReview (teachos-only):", dept.needsReview.length);
  console.log("  mentors:", dept.mentors.length);
  console.log("  opsTeamRows:", dept.opsTeamRows.length);
  console.log("  TOTAL visible people:", dept.all.length);
  const visibleExited = dept.all.filter((r) => !!r.exitDate).length;
  const visibleActive = dept.all.filter((r) => !r.exitDate).length;
  console.log("  -> of those, exit_date set (shown as 'Exited'):", visibleExited);
  console.log("  -> of those, exit_date NOT set (shown as 'Active'):", visibleActive);

  const anyExitSignal = allArchiveRows.filter((r) => r.exitFlag || !!r.exitFlagDate || !!r.exitDate || r.computedStatus === "exited" || r.manualStatus === "exited");
  console.log(`\n=== Every archived row with ANY exit signal (exitFlag / exitFlagDate / exitDate / computedStatus / manualStatus) ===`);
  console.log("  TOTAL:", anyExitSignal.length);

  const visibleIds = new Set(dept.all.map((r) => r.id));
  const hiddenExited = anyExitSignal.filter((r) => !visibleIds.has(r.id));
  console.log(`  Of those, HIDDEN from the Archive page right now (filtered out by department-membership logic): ${hiddenExited.length}`);
  console.log("\n  Sample of hidden exited rows (up to 15):");
  for (const r of hiddenExited.slice(0, 15)) {
    console.log(`    id=${r.id} employee_id=${r.employeeId} name="${r.fullName}" classification=${r.classification} inDarwin=${r.inDarwin} inTeachos=${r.inTeachos} deptBucket=${r.deptBucket} exitFlag=${r.exitFlag} exitDate=${r.exitDate} exitFlagDate=${r.exitFlagDate}`);
  }

  const reasonCounts = new Map<string, number>();
  for (const r of hiddenExited) {
    let reason: string;
    if (!r.inDarwin && !r.inTeachos) reason = "neither inDarwin nor inTeachos (fully gone from both sources)";
    else if (r.inDarwin && r.inDarwinFullRoster && !r.classification) reason = "inDarwin but only via full-roster fallback, unclassified";
    else if (r.inDarwin && !r.classification && r.deptBucket !== "tech" && r.deptBucket !== "non_tech") reason = `inDarwin but deptBucket=${r.deptBucket}`;
    else if (r.inTeachos && !r.inDarwin && r.classification && ["excluded_other_department", "excluded_non_department_team", "iit_kharagpur_team"].includes(r.classification)) reason = `teachos-only but classification=${r.classification} (excluded)`;
    else reason = "other/unclassified reason";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  console.log("\n  Breakdown of why each hidden exited row fails the filter:");
  for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${count}x -- ${reason}`);
  }

  const everPayrollConverted = allArchiveRows.filter((r) => r.classification === "payroll_converted");
  console.log(`\n=== Every archived row ever classified payroll_converted (regardless of current inTeachos/inDarwin) ===`);
  console.log("  TOTAL:", everPayrollConverted.length);
  console.log("  Of those, still inTeachos (visible as Payroll Converted today):", everPayrollConverted.filter((r) => r.inTeachos && !r.inDarwin).length);
  console.log("  Of those, NO LONGER inTeachos (hidden from archive list entirely):", everPayrollConverted.filter((r) => !(r.inTeachos && !r.inDarwin)).length);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
