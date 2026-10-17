// One-off, READ-ONLY (2026-10-17): the session view tags every session with BOTH a learning-portal course (learning_portal_course_id,
// what "Subject (from sessions)" maps today) AND a semester course + course_category (what the session belongs to in the semester
// plan). Sandhra S J's "Intro to Generative AI" sessions were really "English Language Proficiency - B1" (course_category ENGLISH),
// so this lists, for completed Lecture/Practice sessions in the last N days, every course_category with its semester courses and the
// learning-portal courses tagged on them -- to see whether course_category is a more reliable subject than the portal course id.
// Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_course_categories.ts        (last 30 days)
//   pnpm exec tsx src/lib/connectors/_tmp_course_categories.ts 60
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const days = Math.max(1, Math.min(365, Number(args[0]) || 30));
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const [rows] = await bq.query({
    query: `
      SELECT IFNULL(course_category, '(none)') AS category,
        IFNULL(semester_course_title, '(none)') AS semester_course,
        IFNULL(learning_portal_course_title, '(none)') AS portal_course,
        COUNT(*) AS sessions, COUNT(DISTINCT instructor_user_id) AS instructors,
        STRING_AGG(DISTINCT IFNULL(instructor_category, '-'), '/') AS instructor_categories
      FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\`
      WHERE session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE')
        AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL ${days} DAY)
        AND session_start_datetime <= CURRENT_DATETIME()
      GROUP BY 1, 2, 3
      ORDER BY category, semester_course, sessions DESC`,
  });
  console.log(`Completed Lecture/Practice sessions, last ${days} days`);
  console.log(`category | semester course | portal course | sessions | instructors | instructor_category`);
  let last = "";
  for (const r of rows as Record<string, unknown>[]) {
    if (r.category !== last) { console.log(`\n== ${r.category} ==`); last = String(r.category); }
    console.log(`  ${r.semester_course} | ${r.portal_course} | ${r.sessions} | ${r.instructors} | ${r.instructor_categories}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
