// One-off, READ-ONLY (2026-10-17): the courses instructors TEACH (Lecture / Practice, last 30 days) that do not match the Training Stats
// course list, so "Subject (from sessions)" shows "No match" for many people. For each such course: sessions, how many instructors teach
// it, and which Subject those instructors have in the app today -- the most common one is the suggested subject for that course.
// Prints a list to review; writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_teaching_courses.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { getSchema } from "./instructorLearningStatus";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";
import { TEACHING_COURSE_SUBJECTS } from "../../data/teachingCourseSubjects";

async function main() {
  const cols = (await getSchema(SESSION_SCHEDULE_TABLE)).map(([n]) => n);
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c)) ?? null;
  const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c)) ?? null;
  console.log(`Course columns: id = ${idCol ?? "-"}, title = ${titleCol ?? "-"}`);
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const query = `
    SELECT ${idCol ? `REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '')` : "NULL"} AS course_id,
      ${titleCol ? `CAST(${titleCol} AS STRING)` : "NULL"} AS course_title,
      instructor_user_id, COUNT(*) AS sessions
    FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\`
    WHERE session_status = 'COMPLETED' AND instructor_user_id IS NOT NULL
      AND session_type IN ('LECTURE', 'PRACTICE')
      AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY)
    GROUP BY 1, 2, 3`;
  const [rows] = await bq.query({ query });

  const knownIds = new Set(TRAINING_COURSE_TAXONOMY.flatMap((d) => (d.courseIds ?? []).map((i) => i.replace(/-/g, "").toLowerCase())));
  const knownTitles = new Set(TRAINING_COURSE_TAXONOMY.flatMap((d) => d.courseTitles.map((t) => t.trim().toLowerCase())));
  const people = await db.select().from(instructorsTable);
  const subjectOf = new Map(people.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, (p.deptArea || p.manualDeptArea || "(none)") as string]));

  type Course = { title: string; id: string; sessions: number; instructors: Set<string>; subjects: Map<string, number> };
  const courses = new Map<string, Course>();
  let total = 0, unmatchedTotal = 0;
  for (const r of rows as { course_id: string | null; course_title: string | null; instructor_user_id: string; sessions: number }[]) {
    const n = Number(r.sessions);
    total += n;
    const id = r.course_id ?? "";
    const title = r.course_title ?? "";
    // Course ID only (2026-10-17): a course is known when its id is in the training list or the teaching-course list.
    if (id && (knownIds.has(id) || id in TEACHING_COURSE_SUBJECTS)) continue;
    unmatchedTotal += n;
    const key = `${id}|${title}`;
    const c = courses.get(key) ?? { title, id, sessions: 0, instructors: new Set<string>(), subjects: new Map<string, number>() };
    c.sessions += n;
    if (!c.instructors.has(r.instructor_user_id)) {
      c.instructors.add(r.instructor_user_id);
      const s = subjectOf.get(r.instructor_user_id) ?? "(not in app)";
      c.subjects.set(s, (c.subjects.get(s) ?? 0) + 1);
    }
    courses.set(key, c);
  }
  console.log(`\nLecture/Practice sessions, last 30 days: ${total}; NOT matched to a subject: ${unmatchedTotal} across ${courses.size} courses.\n`);
  console.log("sessions | instructors | course title | course id | instructors' current Subject (count) => suggested subject");
  for (const c of [...courses.values()].sort((a, b) => b.sessions - a.sessions)) {
    const subs = [...c.subjects.entries()].sort((a, b) => b[1] - a[1]);
    const suggested = subs.find(([s]) => s !== "(none)" && s !== "(not in app)")?.[0] ?? "?";
    console.log(`${c.sessions} | ${c.instructors.size} | ${c.title || "(no title)"} | ${c.id || "-"} | ${subs.map(([s, k]) => `${s} ${k}`).join(", ")} => ${suggested}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
