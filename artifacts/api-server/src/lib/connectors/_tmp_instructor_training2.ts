// One-off, READ-ONLY (2026-11-12, per request: one instructor's training stats as an Excel sheet -- adds to _tmp_instructor_training.ts):
//   qa_types  -- how many QA-rated evaluations of each evaluation_type she has (all statuses)
//   sessions  -- every completed QA evaluation that is NOT a demo / AI assessment (her regular class sessions): date, type, title, score, minutes
//   taught    -- Taught in Class rows (instructor_taught_course): course, lectures taught / total, sessions, first / last date, topics taught
//   exams     -- topin trainee exams: title, Daily / Weekly, date, best score %, course it maps to
// Prints ONE line of JSON.   pnpm exec tsx src/lib/connectors/_tmp_instructor_training2.ts NW2000396
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable, instructorTaughtCourseTable } from "@workspace/db";
import { config } from "./config";
import { QA_RATING_VIEW } from "./demoTraining";
import { courseOfExam } from "./topinAssessments";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  if (!p?.teachosUserId) { console.log(`${emp}: not in FCC or no TeachOS user id`); process.exit(0); }
  const uid = p.teachosUserId;
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });

  const [types] = await bq.query({ query: `SELECT evaluation_type AS ty, LOWER(status) AS st, COUNT(*) AS n FROM \`${P}.${DS}.${QA_RATING_VIEW}\` WHERE instructor_user_id = @uid GROUP BY 1, 2 ORDER BY 1, 2`, params: { uid } });
  const [ses] = await bq.query({ query: `
    SELECT CAST(session_date AS STRING) AS d, evaluation_type AS ty, session_title AS t, final_score AS s, SAFE_CAST(audio_duration AS FLOAT64) / 60 AS mins
    FROM \`${P}.${DS}.${QA_RATING_VIEW}\`
    WHERE instructor_user_id = @uid AND LOWER(status) = 'completed' AND evaluation_type NOT IN ('DEMO', 'TRAINING_DEMO', 'AI_ASSESSMENT', 'TRAINING_AI_ASSESSMENT')
    ORDER BY session_date`, params: { uid } });
  const taught = (await db.select().from(instructorTaughtCourseTable).where(eq(instructorTaughtCourseTable.instructorUserId, uid))).map((t) => ({
    course_id: t.courseId, course: t.courseTitle, subject: t.courseSubject, lectures_taught: t.completedSessions, lectures_total: t.curriculumSessions,
    sessions: t.sessionsCompleted, scheduled: t.scheduledSessions, first: t.firstTaughtDate, last: t.lastTaughtDate, topics: t.taughtTopics }));
  const table = process.env.TOPIN_ASSESSMENT_TABLE || "z_niat_tech_instrctor_trainee_exam_best_scores_details";
  const [ex] = await bq.query({ query: `SELECT organisation_assessment_id AS a, ANY_VALUE(assessment_title) AS t, ANY_VALUE(exam_type) AS ty, MAX(assessment_best_user_percentage_score) AS s, MAX(exam_attempt_start_date) AS d
    FROM \`${P}.${DS}.${table}\` WHERE instructor_user_id = @uid GROUP BY a ORDER BY d`, params: { uid } });

  console.log(JSON.stringify({
    qa_types: (types as Record<string, unknown>[]).map((r) => ({ type: plain(r.ty), status: plain(r.st), n: Number(plain(r.n)) })),
    sessions: (ses as Record<string, unknown>[]).map((r) => ({ date: plain(r.d), type: plain(r.ty), title: plain(r.t), score: plain(r.s) === "" ? null : Number(plain(r.s)), minutes: plain(r.mins) === "" ? null : Math.round(Number(plain(r.mins)) * 10) / 10 })),
    taught,
    exams: (ex as Record<string, unknown>[]).map((r) => ({ title: plain(r.t), type: plain(r.ty), date: plain(r.d).slice(0, 10), best_pct: Math.round(Math.max(0, Number(plain(r.s)) || 0) * 1000) / 10, course: courseOfExam(plain(r.t))?.title ?? null })),
  }));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
