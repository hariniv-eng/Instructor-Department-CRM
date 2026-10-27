// One-off, READ-ONLY (2026-10-26). Why do most instructors have no "Taught in class" data? For every instructor the page can show
// (TeachOS, NIAT deployed), checks: do they have rows in instructor_taught_course; if not, did they hold any LECTURE session at a
// NIAT campus at all (BigQuery), and in which courses -- so we can see whether the gap is "no lectures", "lectures only in courses
// that are not on the lecture list", "not a NIAT campus", or "sync not run yet". Writes taught_visibility.csv (staff names -- delete
// after download). Changes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_taught_visibility.ts
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import { db, instructorsTable, instructorTaughtCourseTable } from "@workspace/db";
import { config } from "./config";
import { productOf } from "../product";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const all = await db.select().from(instructorsTable);
  const people = all.filter((r) => r.inTeachos && r.teachosUserId && productOf(r) === "NIAT (Deployed)" && (!r.enrolledPlans || /niat/i.test(r.enrolledPlans)));
  const taught = await db.select().from(instructorTaughtCourseTable);
  const withRows = new Set(taught.filter((t) => t.curriculumSessions > 0).map((t) => t.instructorUserId));
  const syncedAt = taught[0]?.syncedAt ?? null;
  console.log(`Taught table: ${taught.length} rows, ${withRows.size} instructors, last sync ${syncedAt ? new Date(syncedAt).toISOString() : "never"}; ` +
    `course ids in table look like: ${[...new Set(taught.slice(0, 200).map((t) => t.courseId.split(":")[0]))].join(", ")} (lecture: = new unit-id method)`);
  console.log(`NIAT instructors the page can show: ${people.length}; with taught data: ${people.filter((p) => withRows.has(p.teachosUserId!)).length}\n`);

  const units = new Set(LECTURE_COURSES.flatMap((c) => c.lectures.flatMap((l) => l.unitIds)));
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const [rows] = await bq.query({ query: `
    SELECT instructor_user_id AS uid, ANY_VALUE(institute_type) AS itype,
           COUNT(DISTINCT IF(UPPER(session_type) = 'LECTURE', session_id, NULL)) AS lecture_sessions,
           COUNT(DISTINCT IF(UPPER(session_type) = 'LECTURE' AND institute_type = 'NIAT_OFFLINE', session_id, NULL)) AS niat_lecture_sessions,
           COUNT(DISTINCT IF(UPPER(session_type) = 'LECTURE' AND institute_type = 'NIAT_OFFLINE' AND REPLACE(LOWER(resource_id), '-', '') IN UNNEST(@units), session_id, NULL)) AS listed_lecture_sessions,
           ARRAY_AGG(DISTINCT IF(UPPER(session_type) = 'LECTURE', learning_portal_course_title, NULL) IGNORE NULLS LIMIT 6) AS courses
    FROM \`${ds}.niat_scheduled_session_wise_resource_details\` WHERE instructor_user_id IN UNNEST(@uids) GROUP BY 1`,
    params: { units: [...units], uids: people.map((p) => p.teachosUserId!) } });
  const bqBy = new Map((rows as Record<string, unknown>[]).map((r) => [plain(r.uid), r]));
  const reasons = new Map<string, number>();
  const unlistedCourses = new Map<string, number>();
  const out = [["Employee ID", "Name", "Subject", "Status", "Lecture sessions (any campus)", "At NIAT campus", "On the lecture list", "Courses taught"].join(",")];
  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  for (const p of people) {
    const r = bqBy.get(p.teachosUserId!);
    const lec = Number(plain(r?.lecture_sessions)) || 0, niat = Number(plain(r?.niat_lecture_sessions)) || 0, listed = Number(plain(r?.listed_lecture_sessions)) || 0;
    const courses = ((r?.courses as unknown[]) ?? []).map(plain);
    const status = withRows.has(p.teachosUserId!) ? "SHOWN"
      : !r || lec === 0 ? "No lecture sessions in the schedule data"
      : niat === 0 ? "Lectures only at non-NIAT campuses"
      : listed === 0 ? "Lectures only in courses not on the lecture list"
      : "Has listed lectures but no taught rows -> run Sync Now";
    reasons.set(status, (reasons.get(status) ?? 0) + 1);
    if (status.startsWith("Lectures only in courses")) for (const c of courses) unlistedCourses.set(c, (unlistedCourses.get(c) ?? 0) + 1);
    out.push([p.employeeId, p.fullName, p.deptArea || p.manualDeptArea, status, lec, niat, listed, courses.join(" | ")].map(esc).join(","));
  }
  console.log(`Why instructors are / are not shown:`);
  for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  console.log(`\nCourses taught by the "not on the lecture list" group (instructors):`);
  for (const [k, v] of [...unlistedCourses].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(v).padStart(4)}  ${k}`);
  fs.writeFileSync("taught_visibility.csv", out.join("\n"));
  console.log(`\nPer instructor: taught_visibility.csv (has staff names -- delete after download).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
