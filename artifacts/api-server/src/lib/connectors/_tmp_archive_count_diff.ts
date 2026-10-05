// One-off diagnostic (2026-10-05): why does the live Instructors tab's
// Instructor Department count (685) differ from the Instructor Archive's
// total (684)? Re-runs BOTH filters (computeDepartmentAndExceptionRows's
// departmentRows in reports.ts, and the equivalent filter in
// GET /reports/instructor-archive) against the live data each pulls from,
// then matches rows across the two the same way archiveInstructors.ts's
// findArchiveMatch() does (employee_id, then teachos_user_id, then
// normalized full name) to find exactly which person is missing -- or
// whether two live rows are collapsing into one archive row.
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { normalize } from "../reconcile";

type LiveRow = typeof instructorsTable.$inferSelect;
type ArchiveRow = typeof instructorArchiveTable.$inferSelect;

function departmentFilter<T extends { inDarwin: boolean; inDarwinFullRoster: boolean; inTeachos: boolean; classification: string | null; deptBucket: string | null }>(allRows: T[]) {
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
  return {
    darwinInstructors, payrollConverted, needsReview, mentors, opsTeamRows,
    all: [...darwinInstructors, ...payrollConverted, ...needsReview, ...mentors, ...opsTeamRows],
  };
}

function keyFor(row: { employeeId: string | null; teachosUserId: string | null; fullName: string }): string {
  if (row.employeeId) return `emp:${row.employeeId}`;
  if (row.teachosUserId) return `teachos:${row.teachosUserId}`;
  return `name:${normalize(row.fullName)}`;
}

async function main() {
  const liveAll = await db.select().from(instructorsTable);
  const archiveAll = await db.select().from(instructorArchiveTable);

  const live = departmentFilter(liveAll);
  const archive = departmentFilter(archiveAll);

  console.log("=== Live instructorsTable (departmentRows) ===");
  console.log("Darwin instructors:", live.darwinInstructors.length);
  console.log("Payroll converted:", live.payrollConverted.length);
  console.log("Needs review (TeachOS-only, uncategorized):", live.needsReview.length);
  console.log("Mentors:", live.mentors.length);
  console.log("Ops team:", live.opsTeamRows.length);
  console.log("TOTAL:", live.all.length);

  console.log("\n=== Archive instructorArchiveTable (same filter) ===");
  console.log("Darwin instructors:", archive.darwinInstructors.length);
  console.log("Payroll converted:", archive.payrollConverted.length);
  console.log("Needs review (TeachOS-only, uncategorized):", archive.needsReview.length);
  console.log("Mentors:", archive.mentors.length);
  console.log("Ops team:", archive.opsTeamRows.length);
  console.log("TOTAL:", archive.all.length);

  // Build key maps, tracking duplicates on each side.
  const liveKeyCounts = new Map<string, LiveRow[]>();
  for (const row of live.all) {
    const k = keyFor(row);
    liveKeyCounts.set(k, [...(liveKeyCounts.get(k) ?? []), row]);
  }
  const archiveKeyCounts = new Map<string, ArchiveRow[]>();
  for (const row of archive.all) {
    const k = keyFor(row);
    archiveKeyCounts.set(k, [...(archiveKeyCounts.get(k) ?? []), row]);
  }

  console.log("\n=== Live rows with NO matching archive row ===");
  let missingCount = 0;
  for (const [k, rows] of liveKeyCounts) {
    if (!archiveKeyCounts.has(k)) {
      missingCount += 1;
      for (const r of rows) {
        console.log(`  MISSING FROM ARCHIVE: id=${r.id} employee_id=${r.employeeId} teachos_user_id=${r.teachosUserId} name="${r.fullName}" classification=${r.classification} inDarwin=${r.inDarwin} inTeachos=${r.inTeachos} deptBucket=${r.deptBucket}`);
      }
    }
  }
  console.log(`Total live keys with no archive match: ${missingCount}`);

  console.log("\n=== Live keys that map to MORE THAN ONE archive row (would overcount archive) ===");
  for (const [k, rows] of liveKeyCounts) {
    const archiveRows = archiveKeyCounts.get(k);
    if (archiveRows && archiveRows.length > 1) {
      console.log(`  KEY ${k} -> ${archiveRows.length} archive rows:`, archiveRows.map((r) => `id=${r.id} name="${r.fullName}"`).join(", "));
    }
  }

  console.log("\n=== Archive keys with NO matching live row (would be fine -- exited people) -- just a sanity count ===");
  let archiveOnlyCount = 0;
  for (const k of archiveKeyCounts.keys()) {
    if (!liveKeyCounts.has(k)) archiveOnlyCount += 1;
  }
  console.log(`Archive-only keys (exited, no longer in live departmentRows filter): ${archiveOnlyCount}`);

  console.log("\n=== Duplicate keys WITHIN live departmentRows itself (two live rows, same key) ===");
  for (const [k, rows] of liveKeyCounts) {
    if (rows.length > 1) {
      console.log(`  KEY ${k} -> ${rows.length} live rows:`, rows.map((r) => `id=${r.id} name="${r.fullName}" employee_id=${r.employeeId}`).join(", "));
    }
  }

  console.log("\n=== Duplicate keys WITHIN archive departmentRows itself (two archive rows, same key) ===");
  for (const [k, rows] of archiveKeyCounts) {
    if (rows.length > 1) {
      console.log(`  KEY ${k} -> ${rows.length} archive rows:`, rows.map((r) => `id=${r.id} name="${r.fullName}" employee_id=${r.employeeId}`).join(", "));
    }
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
