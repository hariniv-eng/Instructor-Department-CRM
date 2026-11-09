// One-off, READ-ONLY (2026-11-09, per request: "after the Darwin + exit sync the Instructor Department count went to 695, later 694 --
// who was added?"). FCC keeps no history of the department list, so this shows the likely candidates:
//   1. the department count now, by group (same rule as the Overview card: computeDepartmentAndExceptionRows)
//   2. department members first seen in the Instructor Archive in the last N days (new people)
//   3. the newest FCC rows (highest ids) and whether each is counted in the department
//   4. NW2000452 (moved from "in Darwin, not an instructor" to payroll after the employee-ID-only fix)
// Prints employee IDs, groups and dates only -- no names.
//   pnpm exec tsx src/lib/connectors/_tmp_department_changes.ts        (last 3 days)
//   pnpm exec tsx src/lib/connectors/_tmp_department_changes.ts 7
import { desc } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";

async function main() {
  const days = Number(process.argv.slice(2).filter((a) => a !== "--")[0] ?? 3) || 3;
  const all = await db.select().from(instructorsTable);
  const r = computeDepartmentAndExceptionRows(all);
  const dept = new Set(r.departmentRows.map((x) => x.id));
  const groupOf = (id: number) =>
    r.darwinInstructorsForCount.some((x) => x.id === id) ? "Darwin instructor"
    : r.payrollConvertedForCount.some((x) => x.id === id) ? "Payroll converted (TeachOS only)"
    : r.needsReviewForCount.some((x) => x.id === id) ? "TeachOS only, needs review"
    : r.mentors.some((x) => x.id === id) ? "Mentor"
    : r.opsTeamRows.some((x) => x.id === id) ? "Operations team" : "not in department";
  console.log(`1. Instructor Department now: ${dept.size}`);
  console.log(`   Darwin instructors ${r.darwinInstructorsForCount.length} | payroll converted ${r.payrollConvertedForCount.length} | TeachOS-only needs review ${r.needsReviewForCount.length} | mentors ${r.mentors.length} | operations ${r.opsTeamRows.length}`);

  const since = new Date(Date.now() - days * 86400000);
  const archive = await db.select().from(instructorArchiveTable);
  const byEmp = new Map(all.filter((x) => x.employeeId).map((x) => [x.employeeId!, x]));
  const fresh = archive.filter((a) => a.firstSeenAt >= since).sort((a, b) => +b.firstSeenAt - +a.firstSeenAt);
  console.log(`\n2. People first seen in the Instructor Archive in the last ${days} day(s): ${fresh.length}`);
  for (const a of fresh) {
    const live = a.employeeId ? byEmp.get(a.employeeId) : undefined;
    console.log(`   ${a.employeeId ?? "(no id)"} | first seen ${a.firstSeenAt.toISOString()} | ${live ? groupOf(live.id) : "no live row"} | in Darwin ${live?.inDarwin ?? "-"} | in TeachOS ${live?.inTeachos ?? "-"} | joining ${live?.dateOfJoining ?? a.dateOfJoining ?? "-"}`);
  }

  const newest = await db.select().from(instructorsTable).orderBy(desc(instructorsTable.id)).limit(10);
  console.log(`\n3. Newest 10 FCC rows (newest first):`);
  for (const x of newest) console.log(`   row ${x.id} | ${x.employeeId ?? "(no id)"} | ${groupOf(x.id)} | in Darwin ${x.inDarwin} | in TeachOS ${x.inTeachos} | joining ${x.dateOfJoining ?? "-"} | designation ${x.designation ?? "-"}`);

  const n = all.find((x) => x.employeeId === "NW2000452");
  console.log(`\n4. NW2000452: ${n ? `${groupOf(n.id)} | in Darwin ${n.inDarwin} | in TeachOS ${n.inTeachos} | classification ${n.classification ?? "-"} | exit ${n.exitFlagStatus ?? "-"}` : "no row"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
