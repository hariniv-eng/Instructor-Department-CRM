// One-off (2026-10-07): the Instructor Archive should be based on the FCC
// Instructors tab's Instructor Department list (not Darwin). Lists archive rows
// flagged in-scope that are NOT in that list today even though the person is
// still in Darwin or TeachOS (people who left both systems are real leavers and
// stay). Dry run by default; pass --apply to clear inArchiveScope on them.
// Run from artifacts/api-server:
//   pnpm exec tsx --env-file=.env src/lib/connectors/_tmp_archive_scope_check.ts
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";
import { normalize } from "../reconcile";

async function main() {
  const apply = process.argv.includes("--apply");
  const live = await db.select().from(instructorsTable);
  const archive = await db.select().from(instructorArchiveTable);
  const { departmentRows } = computeDepartmentAndExceptionRows(live);
  const deptIds = new Set(departmentRows.map((r) => r.id));
  const findLive = (a: typeof archive[number]) =>
    (a.employeeId && live.find((l) => l.employeeId === a.employeeId))
    || (a.teachosUserId && live.find((l) => l.teachosUserId === a.teachosUserId))
    || live.find((l) => normalize(l.fullName) === normalize(a.fullName));

  const inScope = archive.filter((a) => a.inArchiveScope);
  console.log(`Instructors tab department list today: ${departmentRows.length}`);
  console.log(`Archive rows flagged in scope: ${inScope.length}\n`);

  let inDept = 0, leavers = 0;
  const suspicious: Array<{ a: typeof archive[number]; l: typeof live[number] }> = [];
  for (const a of inScope) {
    const l = findLive(a);
    if (!l) { leavers += 1; continue; }
    if (deptIds.has(l.id)) { inDept += 1; continue; }
    if (!l.inDarwin && !l.inTeachos) {
      // A row with no Employee ID that is in neither system has nothing to anchor a leaver to (no exit record can exist for it) -- treat as an extra, not a leaver.
      if (!l.employeeId) { suspicious.push({ a, l }); continue; }
      leavers += 1; continue;
    }
    suspicious.push({ a, l });
  }
  console.log(`in the department list today: ${inDept}`);
  console.log(`left Darwin and TeachOS (real leavers, kept): ${leavers}`);
  console.log(`still in Darwin/TeachOS but NOT in the department list: ${suspicious.length}\n`);
  for (const { a, l } of suspicious) {
    console.log([a.fullName, a.employeeId ?? "-", `inDarwin=${l.inDarwin}`, `inTeachos=${l.inTeachos}`, `fullRoster=${l.inDarwinFullRoster}`, `class=${l.classification ?? "-"}`, `bucket=${l.deptBucket ?? "-"}`, `dept=${l.department ?? "-"}`, `designation=${l.designation ?? "-"}`].join(" | "));
  }
  if (apply && suspicious.length) {
    for (const { a } of suspicious) await db.update(instructorArchiveTable).set({ inArchiveScope: false }).where(eq(instructorArchiveTable.id, a.id));
    console.log(`\nAPPLIED: cleared inArchiveScope on ${suspicious.length} rows.`);
  } else if (suspicious.length) {
    console.log("\n(dry run -- re-run with --apply to remove these from the archive)");
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
