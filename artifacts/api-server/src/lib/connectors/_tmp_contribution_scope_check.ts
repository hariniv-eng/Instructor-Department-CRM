// One-off, READ-ONLY (2026-10-16): who the Contribution tab lists before vs after the "Instructor Department only" change in
// routes/reports.ts (GET /reports/instructor-contribution). Prints everyone the new rule drops, everyone still listed whose Darwin
// department does not look like the Instructors department, and Saumya Sunil Patil's row. Writes nothing.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_contribution_scope_check.ts
import { db, instructorsTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";

const EXCLUDED = new Set(["excluded_other_department", "excluded_non_department_team", "excluded_ops_managers", "instructor_ops", "iit_kharagpur_team", "other_department_manual"]);

async function main() {
  const all = await db.select().from(instructorsTable);
  const before = all.filter((r) => r.inTeachos && !EXCLUDED.has(r.classification ?? ""));
  const { countedInstructorRows, mentors } = computeDepartmentAndExceptionRows(all);
  const ids = new Set([...countedInstructorRows, ...mentors].map((r) => r.id));
  const after = all.filter((r) => r.inTeachos && ids.has(r.id) && (r.employeeId?.toUpperCase() === "NW0005068" || !EXCLUDED.has(r.classification ?? "")));
  const afterIds = new Set(after.map((r) => r.id));
  const fmt = (r: (typeof all)[number]) => `${r.employeeId ?? "-"} | ${r.fullName} | dept: ${r.department ?? "-"} / ${r.subDepartment ?? "-"} | class: ${r.classification ?? "-"} | inDarwin ${r.inDarwin} fullRoster ${r.inDarwinFullRoster} | bucket ${r.deptBucket ?? "-"}`;

  console.log(`Listed before: ${before.length}   after: ${after.length}`);
  const dropped = before.filter((r) => !afterIds.has(r.id));
  console.log(`\n=== Dropped by the new rule (${dropped.length}) ===`);
  for (const r of dropped) console.log(fmt(r));
  const added = after.filter((r) => !before.some((b) => b.id === r.id));
  console.log(`\n=== Newly listed (${added.length}) ===`);
  for (const r of added) console.log(fmt(r));
  const odd = after.filter((r) => !/instructor/i.test(`${r.department ?? ""} ${r.subDepartment ?? ""}`));
  console.log(`\n=== Still listed, department text does not mention "Instructor" (${odd.length}) -- check these ===`);
  for (const r of odd) console.log(fmt(r));
  // 2026-10-16: "around 652 instructors + mentors have TeachOS, only 606 show in the Contribution table -- why?" Every Instructors-tab
  // instructor or mentor, split by the reason they are or are not on the Contribution tab (new rule).
  const dept = all.filter((r) => ids.has(r.id));
  const reasonOf = (r: (typeof all)[number]): string => {
    if (afterIds.has(r.id)) return r.teachosUserId ? "LISTED" : "LISTED but no TeachOS user id (no data can join)";
    if (!r.inTeachos) return r.teachosUserId ? "NOT LISTED: has a TeachOS id but inTeachos=false (not in the latest TeachOS sync)" : "NOT LISTED: not in TeachOS";
    return `NOT LISTED: classification '${r.classification}' is excluded`;
  };
  const byReason = new Map<string, (typeof all)[number][]>();
  for (const r of dept) { const k = reasonOf(r); byReason.set(k, [...(byReason.get(k) ?? []), r]); }
  console.log(`\n=== Instructors-tab Instructors + Mentors: ${dept.length} (${countedInstructorRows.length} instructors, ${mentors.length} mentors); with a TeachOS id: ${dept.filter((r) => r.teachosUserId).length}; inTeachos: ${dept.filter((r) => r.inTeachos).length} ===`);
  for (const [k, rows] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n-- ${k}: ${rows.length}`);
    if (!k.startsWith("LISTED") || k.includes("no TeachOS")) for (const r of rows.slice(0, 80)) console.log(`   ${fmt(r)} | teachosId ${r.teachosUserId ?? "-"} | status ${r.computedStatus ?? "-"}/${r.manualStatus ?? "-"}`);
  }
  const oldOnly = before.filter((r) => !ids.has(r.id));
  console.log(`\nOn the Contribution tab under the OLD rule but not an Instructors-tab instructor/mentor: ${oldOnly.length}`);

  console.log("\n=== Saumya Sunil Patil ===");
  for (const r of all.filter((x) => x.employeeId?.toUpperCase() === "NW0005068")) console.log(`${fmt(r)} | listed after: ${afterIds.has(r.id)}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
