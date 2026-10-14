// One-off, READ-ONLY (2026-10-14): finds the real course ids for DIA and IPS. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_dia_ips_course_check.ts
import { inspectDsaRelatedCourses } from "./instructorLearningStatus";

async function main() {
  const { idColumn, courses, topics } = await inspectDsaRelatedCourses();
  console.log(`Course id column: ${idColumn ?? "NONE FOUND"}\n`);
  console.log("=== DSA-related courses (course_id | title | topics | instructors | unit rows) ===");
  for (const c of courses) console.log(`${c.course_id} | "${c.course_title}" | ${c.topics} topics | ${c.instructors} instructors | ${c.unit_rows} rows`);
  console.log("\n=== Topics inside each course ===");
  let last = "";
  for (const t of topics) {
    const head = `${t.course_title} [${t.course_id}]`;
    if (head !== last) { console.log(`\n${head}`); last = head; }
    console.log(`   - ${t.topic_title}  (${t.instructors} instructors)`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
