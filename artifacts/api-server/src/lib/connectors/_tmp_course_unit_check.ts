// One-off, READ-ONLY (2026-10-27, per request: "there is no data in the IPS column"). For ONE course of the lecture list, checks every
// lecture against BigQuery (niat_scheduled_session_wise_resource_details, all institute types, all session types / statuses):
//   - by unit ID: instructors / rows per session type, institute type and status  (what "Taught in class" can count: NIAT_OFFLINE +
//     LECTURE + COMPLETED)
//   - by title: other unit IDs whose resource title equals the lecture name (a campus version with its own IDs), with the portal course
// plus what is stored now for the course. No staff names. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_course_unit_check.ts IPS
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorTaughtCourseTable } from "@workspace/db";
import { config } from "./config";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const nameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
async function main() {
  const want = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "IPS").toLowerCase();
  const course = LECTURE_COURSES.find((c) => c.title.toLowerCase() === want) ?? LECTURE_COURSES.find((c) => c.title.toLowerCase().includes(want));
  if (!course) { console.log(`No course "${want}". Courses: ${LECTURE_COURSES.map((c) => c.title).join(", ")}`); process.exit(1); }
  const stored = await db.select().from(instructorTaughtCourseTable).where(eq(instructorTaughtCourseTable.courseId, `lecture:${course.key}`));
  console.log(`"${course.title}" (key ${course.key}, ${course.lectures.length} lectures). Stored now: ${stored.length} instructor rows, ` +
    `${stored.filter((s) => s.completedSessions > 0).length} with a completed lecture${stored[0] ? `, synced ${new Date(stored[0].syncedAt).toISOString()}` : " (none -- sync not run since the course was added, or nothing matched)"}\n`);

  const units = course.lectures.flatMap((l) => l.unitIds);
  const names = course.lectures.map((l) => nameKey(l.name));
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const t = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.niat_scheduled_session_wise_resource_details\``;
  const [byId] = await bq.query({ query: `
    SELECT REPLACE(LOWER(resource_id), '-', '') AS unit, institute_type AS it, UPPER(session_type) AS st, session_status AS ss,
           COUNT(DISTINCT instructor_user_id) AS ins, COUNT(*) AS n
    FROM ${t} WHERE REPLACE(LOWER(resource_id), '-', '') IN UNNEST(@units) GROUP BY 1, 2, 3, 4`, params: { units } });
  const [byTitle] = await bq.query({ query: `
    SELECT REGEXP_REPLACE(REPLACE(LOWER(resource_title), '&', 'and'), r'[^a-z0-9]', '') AS k, REPLACE(LOWER(resource_id), '-', '') AS unit,
           ANY_VALUE(learning_portal_course_title) AS course, COUNT(DISTINCT IF(UPPER(session_type) = 'LECTURE', instructor_user_id, NULL)) AS lec_ins,
           COUNT(DISTINCT instructor_user_id) AS ins
    FROM ${t} WHERE REGEXP_REPLACE(REPLACE(LOWER(resource_title), '&', 'and'), r'[^a-z0-9]', '') IN UNNEST(@names)
      AND REPLACE(LOWER(resource_id), '-', '') NOT IN UNNEST(@units) GROUP BY 1, 2 ORDER BY 1, 4 DESC`, params: { names, units } });
  const idRows = byId as Record<string, unknown>[];
  const tRows = byTitle as Record<string, unknown>[];
  let anyCountable = 0;
  for (const l of course.lectures) {
    const mine = idRows.filter((r) => l.unitIds.includes(plain(r.unit)));
    const countable = mine.filter((r) => plain(r.it) === "NIAT_OFFLINE" && plain(r.st) === "LECTURE" && plain(r.ss) === "COMPLETED").reduce((a, r) => a + Number(plain(r.ins)), 0);
    if (countable) anyCountable++;
    console.log(`#${l.n} ${l.name}: ${mine.length ? mine.map((r) => `${plain(r.it)}/${plain(r.st)}/${plain(r.ss)} ${plain(r.ins)} instr`).join("; ") : "unit ID not found in BigQuery"}`);
    for (const r of tRows.filter((x) => plain(x.k) === nameKey(l.name)))
      console.log(`     same title, other unit ${plain(r.unit)} | course ${plain(r.course) || "-"} | ${plain(r.lec_ins)} instructors in lectures (${plain(r.ins)} any type)`);
  }
  console.log(`\nLectures with at least one countable session (NIAT_OFFLINE, LECTURE, COMPLETED): ${anyCountable} / ${course.lectures.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
