// One-off, READ-ONLY (2026-10-14): confirms the DIA and IPS course ids exist in our unit-completion table. Run from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_dia_course_check.ts
import { inspectCourseIds } from "./instructorLearningStatus";

async function main() {
  const { idColumn, rows } = await inspectCourseIds(["9e370332-c9dd-4778-9e65-e5d7f75c24f3", "c51b2ebf-d646-4680-b868-e731110ef183"]);
  console.log(`Course id column: ${idColumn ?? "NONE FOUND"}`);
  if (rows.length === 0) console.log("Course id NOT found in our table.");
  for (const r of rows) console.log(`[${r.course_id}] course_title: "${r.course_title}" | topics ${r.topics} | instructors ${r.instructors} | unit rows ${r.unit_rows} | completed rows ${r.completed_rows}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
