// One-off, READ-ONLY (2026-10-27): why does "Taught in class" show a number (e.g. 0) for one instructor and one course? Prints:
// 1) what is stored now (instructor_taught_course rows for this person, with when they were synced) -- this is what the page shows;
// 2) what the next sync would store, worked out live with the current code (fetchTaughtCourseRows), for this person only;
// 3) the institute type / status of this person's sessions that use the course's unit IDs (the sync reads NIAT_OFFLINE, LECTURE,
//    status exactly COMPLETED). Writes nothing. No other staff printed.
//   pnpm exec tsx src/lib/connectors/_tmp_taught_person_diag.ts NW0004813 "Modern Responsive"
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable, instructorTaughtCourseTable } from "@workspace/db";
import { config } from "./config";
import { fetchTaughtCourseRows } from "./taughtTraining";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const employeeId = (args[0] ?? "").trim().toUpperCase();
  const want = (args[1] ?? "Modern Responsive").toLowerCase();
  const course = LECTURE_COURSES.find((c) => c.title.toLowerCase().includes(want) || c.key.toLowerCase().includes(want));
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, employeeId));
  if (!p?.teachosUserId || !course) { console.log("person or course not found"); process.exit(0); }
  const uid = p.teachosUserId;
  console.log(`${employeeId} · TeachOS ${uid} · Subject (dept area): ${p.deptArea || "-"} · manual: ${p.manualDeptArea || "-"} · course "${course.title}" key ${course.key} subject ${course.subject}\n`);

  const stored = await db.select().from(instructorTaughtCourseTable).where(eq(instructorTaughtCourseTable.instructorUserId, uid));
  console.log(`1) STORED now (${stored.length} rows) -- course | completed / scheduled / total | synced at`);
  for (const s of stored) console.log(`   ${s.courseId} ${s.courseTitle} | ${s.completedSessions} / ${s.scheduledSessions} / ${s.curriculumSessions} | ${new Date(s.syncedAt).toISOString()}`);

  const live = (await fetchTaughtCourseRows()).filter((r) => r.instructor_user_id === uid);
  console.log(`\n2) NEXT SYNC would store (${live.length} rows) -- course | completed / scheduled / total`);
  for (const r of live) console.log(`   ${r.course_id} ${r.course_title} | ${r.completed_sessions} / ${r.scheduled_sessions} / ${r.curriculum_sessions}`);

  const units = course.lectures.flatMap((l) => l.unitIds);
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const [rows] = await bq.query({
    query: `SELECT institute_type, UPPER(session_type) AS type, session_status, COUNT(DISTINCT session_id) AS n
            FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.niat_scheduled_session_wise_resource_details\`
            WHERE instructor_user_id = @uid AND REPLACE(LOWER(resource_id), '-', '') IN UNNEST(@units) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
    params: { uid, units },
  });
  console.log(`\n3) Her sessions using "${course.title}" unit IDs -- institute type | session type | status | sessions`);
  for (const r of rows as Record<string, unknown>[]) console.log(`   ${plain(r.institute_type)} | ${plain(r.type)} | ${plain(r.session_status)} | ${plain(r.n)}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
