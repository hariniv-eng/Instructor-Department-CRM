// One-off, READ-ONLY (2026-10-14): why do DSA instructors show "no data" on Training Stats? Finds the instructors whose Subject
// is DSA, then shows (1) how many have ANY row in the BigQuery training table, (2) which course_title values they really
// have rows for, (3) which company-wide course titles look DSA-related, and (4) what the synced FCC table holds for them.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_dsa_instructor_coverage.ts
import { db, instructorsTable, instructorTrainingStatusTable } from "@workspace/db";
import { inspectDsaCoverage } from "./instructorLearningStatus";

async function main() {
  const all = await db.select().from(instructorsTable);
  const dsa = all.filter((p) => (p.deptArea === "DSA" || p.manualDeptArea === "DSA") && (p.inDarwin || p.inTeachos));
  const withId = dsa.filter((p) => p.teachosUserId);
  console.log(`Instructors with Subject = DSA (in Darwin or TeachOS): ${dsa.length}`);
  console.log(`  with a TeachOS user id: ${withId.length}  | without one (cannot match training): ${dsa.length - withId.length}`);
  for (const p of dsa.filter((x) => !x.teachosUserId)) console.log(`     no TeachOS id: ${p.fullName} (${p.employeeId ?? "-"})`);

  const ids = withId.map((p) => p.teachosUserId as string);
  const { mine, looksDsa, people } = await inspectDsaCoverage(ids);
  const haveAny = new Set(people.map((r) => String(r.instructor_user_id)));
  console.log(`\nOf those ${withId.length}, instructors with ANY row in the BigQuery training table: ${haveAny.size}`);
  console.log(`  with NO training rows at all: ${withId.length - haveAny.size}`);
  for (const p of withId.filter((x) => !haveAny.has(x.teachosUserId as string)).slice(0, 40)) console.log(`     none: ${p.fullName} (${p.employeeId ?? "-"})`);

  console.log("\nCourses the DSA instructors really have rows for (course_title | instructors | unit rows | completed rows | topics):");
  for (const r of mine.slice(0, 40)) console.log(`  ${r.course_title} | ${r.instructors} | ${r.unit_rows} | ${r.completed_rows} | ${r.topics}`);

  console.log("\nCompany-wide course titles that look DSA-related (course_title | instructors | unit rows):");
  for (const r of looksDsa.slice(0, 40)) console.log(`  ${r.course_title} | ${r.instructors} | ${r.unit_rows}`);

  const synced = await db.select().from(instructorTrainingStatusTable);
  const idset = new Set(ids);
  const mineSynced = synced.filter((r) => idset.has(r.instructorUserId) && ["dsa", "dia", "ips"].includes(r.courseKey));
  console.log(`\nSynced FCC training rows for these instructors in the DSA / DIA / IPS columns: ${mineSynced.length}`);
  for (const key of ["dsa", "dia", "ips"]) {
    const l = mineSynced.filter((r) => r.courseKey === key);
    console.log(`  ${key.toUpperCase()}: ${l.length} instructors (completed ${l.filter((r) => r.status === "COMPLETED").length}, in progress ${l.filter((r) => r.status === "IN_PROGRESS").length}, not started ${l.filter((r) => r.status === "NOT_STARTED").length})`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
