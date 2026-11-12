// One-off, READ-ONLY (2026-11-12, per request: "all the training data of one instructor -- learning portal, demos, AI assessments --
// combined"). For one employee ID prints ONE line of JSON (paste it back to build the report):
//   profile  -- subject, product, campus, Capability Manager, date of joining, deployment date (first session, Contribution)
//   lp       -- Training - LP columns (last sync: units completed / total, status) + live learning-portal course titles
//   evals    -- every completed DEMO / TRAINING_DEMO / AI_ASSESSMENT / TRAINING_AI_ASSESSMENT: date, type, in training or after
//               deployment (same rule as Training - Demos), topic, matched course + lecture, score /10, minutes
//   lectures -- each Frontend course's lecture list (number + name), to show which lectures are covered
//   pnpm exec tsx src/lib/connectors/_tmp_instructor_training.ts NW2000396
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable, instructorTrainingStatusTable, instructorContributionTable } from "@workspace/db";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { QA_RATING_VIEW, lectureNameIndex, matchDemoTopic, demoKindOf } from "./demoTraining";
import { LECTURE_COURSES } from "../../data/lectureSessions";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  if (!p?.teachosUserId) { console.log(`${emp}: not in FCC or no TeachOS user id`); process.exit(0); }
  const uid = p.teachosUserId;
  const [c] = await db.select().from(instructorContributionTable).where(eq(instructorContributionTable.instructorUserId, uid));
  const deployed = c?.deploymentDate ?? null;
  const subject = normalizeSubjectArea(p.deptArea || p.manualDeptArea || null);

  const stored = await db.select().from(instructorTrainingStatusTable).where(eq(instructorTrainingStatusTable.instructorUserId, uid));
  const label = new Map(TRAINING_COURSE_TAXONOMY.map((t) => [t.key, t.label]));
  const lpStored = stored.map((r) => ({ group: r.trackGroup, key: r.courseKey, course: label.get(r.courseKey) ?? r.courseKey, done: r.unitsCompleted, total: r.unitsTotal, status: r.status }));

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [portal] = await bq.query({ query: `
    SELECT course_title AS ct, COUNT(*) AS total, COUNTIF(completion_status = 'COMPLETED') AS done, COUNTIF(completion_status = 'IN_PROGRESS') AS prog
    FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${UNIT_COMPLETION_TABLE}\` WHERE instructor_user_id = @uid GROUP BY 1 ORDER BY 1`, params: { uid } });
  const lpPortal = (portal as Record<string, unknown>[]).map((r) => ({ course: plain(r.ct), done: Number(plain(r.done)), total: Number(plain(r.total)), in_progress: Number(plain(r.prog)) }));

  const [ev] = await bq.query({ query: `
    SELECT session_title AS t, final_score AS s, CAST(session_date AS STRING) AS d, evaluation_type AS ty, SAFE_CAST(audio_duration AS FLOAT64) / 60 AS mins
    FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\`
    WHERE instructor_user_id = @uid AND evaluation_type IN ('DEMO', 'TRAINING_DEMO', 'AI_ASSESSMENT', 'TRAINING_AI_ASSESSMENT') AND LOWER(status) = 'completed'
    ORDER BY session_date`, params: { uid } });
  const idx = lectureNameIndex();
  const evals = (ev as Record<string, unknown>[]).map((r) => {
    const hits = matchDemoTopic(idx, plain(r.t)) ?? [];
    const own = hits.filter((h) => !subject || LECTURE_COURSES[h.ci].subject === subject);
    const h = (own.length ? own : hits)[0];
    const d = plain(r.d) || null;
    const kind = demoKindOf(plain(r.ty), d, { joining: p.dateOfJoining ?? null, deployed });
    const mins = plain(r.mins) === "" ? null : Math.round(Number(plain(r.mins)) * 10) / 10;
    return { date: d, type: plain(r.ty), kind, topic: plain(r.t), course: h ? LECTURE_COURSES[h.ci].title : null, course_key: h ? LECTURE_COURSES[h.ci].key : null,
      lecture: h && h.n > 0 ? h.n : null, score: plain(r.s) === "" ? null : Number(plain(r.s)), minutes: mins };
  });
  const lectures = LECTURE_COURSES.filter((x) => x.subject === (subject ?? "Frontend")).map((x) => ({ key: x.key, title: x.title, lectures: x.lectures.map((l) => [l.n, l.name]) }));

  console.log(JSON.stringify({
    profile: { employee_id: p.employeeId, name: p.fullName, subject, product: productOf(p), campus: p.institutes ?? [], capability_manager: p.teachosManager || p.manualCapabilityManager || null,
      date_of_joining: p.dateOfJoining ?? null, deployment_date: deployed },
    lp: { stored: lpStored, portal: lpPortal }, evals, lectures,
  }));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
