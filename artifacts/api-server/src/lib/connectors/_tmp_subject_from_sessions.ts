// One-off, READ-ONLY (2026-10-17, per request): can each instructor's SUBJECT be worked out from what they actually taught in the last
// 30 days? Takes every COMPLETED session in the last 30 days from the session-schedule view, matches its course (by course id, else
// course title) to the Training Stats course list (trainingCourseTaxonomy.ts), and so to a track / subject, then compares that with
// the subject the app has today. Prints the session view's course/topic columns, how many sessions could be matched, the biggest
// unmatched courses, and per-instructor results (matches, mismatches, people teaching two subjects). Writes nothing.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_subject_from_sessions.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { getSchema } from "./instructorLearningStatus";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";
import { normalizeSubjectArea } from "../departmentTaxonomy";

// Track group -> the app's Subject value (inverse of SUBJECT_TRACK on the Training Stats tab).
const TRACK_SUBJECT: Record<string, string> = {
  "Frontend Development": "Frontend", "Backend Development": "Backend", DSA: "DSA", "Gen AI": "GenAI",
  DSML: "Artificial Intelligence & Emerging Technologies", Aptitude: "Aptitude", Maths: "Maths", English: "English",
};
const MULTI_SHARE = 0.2; // a second subject counts when it is at least 20% of the person's matched sessions

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ref = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}`;
  const cols = (await getSchema(SESSION_SCHEDULE_TABLE)).map(([n]) => n);
  console.log(`=== 1. ${SESSION_SCHEDULE_TABLE}: course / topic / subject columns ===`);
  console.log(cols.filter((c) => /course|topic|subject|track|unit|module/i.test(c)).join(", ") || "(none)");
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c)) ?? null;
  const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c)) ?? null;
  console.log(`Using course id column: ${idCol ?? "(none)"}, course title column: ${titleCol ?? "(none)"}`);
  if (!idCol && !titleCol) { console.log("No course column in the session view -- subject can't be derived this way."); process.exit(0); }

  const query = `
    SELECT instructor_user_id,
      ${idCol ? `REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '')` : "NULL"} AS course_id,
      ${titleCol ? `CAST(${titleCol} AS STRING)` : "NULL"} AS course_title,
      COUNT(*) AS sessions
    FROM \`${ref}\`
    WHERE session_status = 'COMPLETED' AND instructor_user_id IS NOT NULL
      AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY)
    GROUP BY 1, 2, 3`;
  const [rows] = await bq.query({ query });

  const byId = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const def of TRAINING_COURSE_TAXONOMY) {
    for (const cid of def.courseIds ?? []) byId.set(cid.replace(/-/g, "").toLowerCase(), def.trackGroup);
    for (const t of def.courseTitles) byTitle.set(t.trim().toLowerCase(), def.trackGroup);
  }

  let total = 0, matched = 0;
  const unmatched = new Map<string, number>();
  const perInstructor = new Map<string, Map<string, number>>();
  for (const r of rows as { instructor_user_id: string; course_id: string | null; course_title: string | null; sessions: number }[]) {
    const n = Number(r.sessions);
    total += n;
    const track = (r.course_id && byId.get(r.course_id)) || (r.course_title && byTitle.get(r.course_title.trim().toLowerCase())) || null;
    if (!track) { const k = `${r.course_title ?? "(no title)"} [${r.course_id ?? "-"}]`; unmatched.set(k, (unmatched.get(k) ?? 0) + n); continue; }
    matched += n;
    const m = perInstructor.get(r.instructor_user_id) ?? new Map<string, number>();
    m.set(track, (m.get(track) ?? 0) + n);
    perInstructor.set(r.instructor_user_id, m);
  }
  const instructorsWithSessions = new Set((rows as { instructor_user_id: string }[]).map((r) => r.instructor_user_id)).size;
  console.log(`\n=== 2. Coverage, last 30 days ===`);
  console.log(`${total} completed sessions by ${instructorsWithSessions} instructors; ${matched} (${total ? Math.round((matched / total) * 1000) / 10 : 0}%) matched to a training course / subject; ${perInstructor.size} instructors have at least one matched session.`);
  console.log(`\nBiggest UNMATCHED courses (sessions) -- add these to the course list if they belong to a subject:`);
  for (const [k, n] of [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${n}  ${k}`);

  const people = await db.select().from(instructorsTable);
  const byTeachos = new Map(people.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, p]));
  let same = 0, differ = 0, noSubjectNow = 0, multi = 0, notInApp = 0;
  const differRows: string[] = [];
  const multiRows: string[] = [];
  for (const [tid, tracks] of perInstructor) {
    const p = byTeachos.get(tid);
    if (!p) { notInApp += 1; continue; }
    const sum = [...tracks.values()].reduce((a, b) => a + b, 0);
    const derived = [...tracks.entries()].sort((a, b) => b[1] - a[1]).filter(([, n], i) => i === 0 || n / sum >= MULTI_SHARE).map(([t]) => TRACK_SUBJECT[t] ?? t);
    const breakdown = [...tracks.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${TRACK_SUBJECT[t] ?? t} ${n}`).join(", ");
    const current = normalizeSubjectArea(p.deptArea || p.manualDeptArea || null);
    if (derived.length > 1) { multi += 1; multiRows.push(`${p.employeeId ?? "-"} | ${p.fullName} | now: ${current ?? "-"} | taught: ${breakdown}`); }
    if (!current) noSubjectNow += 1;
    else if (derived.includes(current)) same += 1;
    else { differ += 1; differRows.push(`${p.employeeId ?? "-"} | ${p.fullName} | now: ${current} | taught: ${breakdown}`); }
  }
  console.log(`\n=== 3. Derived subject vs the app's current Subject (${perInstructor.size} instructors with matched sessions) ===`);
  console.log(`Agrees: ${same} · Different: ${differ} · No subject set today: ${noSubjectNow} · Teaching 2+ subjects (each >= ${MULTI_SHARE * 100}%): ${multi} · Not in the app: ${notInApp}`);
  console.log(`\n-- Different (first 60):`);
  for (const l of differRows.slice(0, 60)) console.log(`  ${l}`);
  console.log(`\n-- Teaching 2+ subjects (first 40):`);
  for (const l of multiRows.slice(0, 40)) console.log(`  ${l}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
