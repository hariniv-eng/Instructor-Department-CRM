// One-off, READ-ONLY (2026-10-31, per request: "department count 695 + exits 26 should be the Instructor Archive total, but it is 717 --
// why?"). Rebuilds the three numbers with the app's own code -- Instructor Department (computeDepartmentAndExceptionRows), the Archive
// (loadArchivePeople, with Active / Exited / SNP) and the Overview exit card (Exited + Approved + not payroll) -- matches people across
// them by employee ID / TeachOS id, and lists every person who makes "department + exits" differ from the archive total, with the reason.
// Employee IDs only, no names. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_archive_total_check.ts
import { db, instructorsTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows, loadArchivePeople } from "../../routes/reports";

async function main() {
  const live = await db.select().from(instructorsTable);
  const { departmentRows, countedInstructorRows, mentors, opsTeamRows } = computeDepartmentAndExceptionRows(live);
  const people = await loadArchivePeople();
  const card = people.filter((p) => p.status === "Exited" && (p.exit_status ?? "").trim().toLowerCase() === "approved" && !p.is_payroll);
  const keyOf = (emp?: string | null, uid?: string | null) => (emp ? `e:${emp.toUpperCase()}` : uid ? `u:${uid}` : "");
  const keysOf = (emp?: string | null, uid?: string | null) => [emp ? `e:${emp.toUpperCase()}` : "", uid ? `u:${uid}` : ""].filter(Boolean);
  const deptKeys = new Set(departmentRows.flatMap((r) => keysOf(r.employeeId, r.teachosUserId)));
  const inDept = (p: { employee_id: string | null; teachos_user_id: string | null }) => keysOf(p.employee_id, p.teachos_user_id).some((k) => deptKeys.has(k));
  const archKeys = new Set(people.flatMap((p) => keysOf(p.employee_id, p.teachos_user_id)));
  const liveBy = new Map(live.flatMap((r) => keysOf(r.employeeId, r.teachosUserId).map((k) => [k, r] as const)));
  const why = (p: { employee_id: string | null; teachos_user_id: string | null }) => {
    const r = keysOf(p.employee_id, p.teachos_user_id).map((k) => liveBy.get(k)).find(Boolean);
    return r ? `class=${r.classification ?? "-"}, inDarwin=${r.inDarwin}, inTeachos=${r.inTeachos}, deptBucket=${r.deptBucket ?? "-"}, exitFlag=${r.exitFlagStatus ?? "-"}, review=${r.exitVerification ?? "-"}` : "no live row";
  };

  const st = (s: string) => people.filter((p) => p.status === s).length;
  console.log(`Instructor Department (all, incl. mentors + ops): ${departmentRows.length}  [instructors ${countedInstructorRows.length}, mentors ${mentors.length}, ops ${opsTeamRows.length}]`);
  console.log(`Archive total: ${people.length}  [Active ${st("Active")}, SNP ${st("SNP")}, Exited ${st("Exited")}]`);
  console.log(`Overview exit card (Exited + Approved + not payroll): ${card.length}\n`);

  const notInArchive = departmentRows.filter((r) => !keysOf(r.employeeId, r.teachosUserId).some((k) => archKeys.has(k)));
  console.log(`A) In the department but NOT in the archive: ${notInArchive.length}`);
  for (const r of notInArchive) console.log(`   ${r.employeeId ?? `TeachOS ${r.teachosUserId}`} | class=${r.classification ?? "-"}, inArchiveScope? check archive row`);

  const activeNotDept = people.filter((p) => p.status !== "Exited" && !inDept(p));
  console.log(`\nB) In the archive as ${"Active/SNP"} but NOT in the department today: ${activeNotDept.length}`);
  for (const p of activeNotDept) console.log(`   ${p.employee_id ?? `TeachOS ${p.teachos_user_id}`} | archive ${p.status} | ${why(p)}`);

  const exitedInDept = people.filter((p) => p.status === "Exited" && inDept(p));
  console.log(`\nC) Archive Exited but STILL counted in the department: ${exitedInDept.length}`);
  for (const p of exitedInDept) console.log(`   ${p.employee_id ?? p.teachos_user_id} | exit ${p.exit_status ?? "-"} | ${why(p)}`);

  const exitedNotCard = people.filter((p) => p.status === "Exited" && !card.includes(p));
  console.log(`\nD) Archive Exited but NOT on the exit card: ${exitedNotCard.length}`);
  for (const p of exitedNotCard) console.log(`   ${p.employee_id ?? p.teachos_user_id} | exit status ${p.exit_status ?? "-"} | payroll ${p.is_payroll} | ${why(p)}`);

  console.log(`\nCheck: department ${departmentRows.length} - A ${notInArchive.length} + B ${activeNotDept.length} - C ${exitedInDept.length} + archive Exited ${st("Exited")} = ` +
    `${departmentRows.length - notInArchive.length + activeNotDept.length - exitedInDept.length + st("Exited")} (archive total ${people.length}; duplicates in the department would make this differ)`);
  const dupDept = departmentRows.length - new Set(departmentRows.map((r) => keyOf(r.employeeId, r.teachosUserId) || `id:${r.id}`)).size;
  console.log(`Duplicate people in the department list: ${dupDept}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
