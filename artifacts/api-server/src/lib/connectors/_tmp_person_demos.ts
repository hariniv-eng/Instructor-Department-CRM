// One-off, READ-ONLY (2026-10-29, per request: "this instructor shows an average QA of 0 -- verify"). Lists every DEMO / TRAINING_DEMO /
// AI evaluation of one person in niat_session_wise_qa_rating: date, type, status, final_score, recording length, which lecture-list course
// the topic matches (what the Demos tab counts), and whether a report / transcript link exists. Then the average the Demos tab would show
// per course. Also prints how many completed demos company-wide have a score of exactly 0. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_person_demos.ts NW0005240
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable, instructorDemoCourseTable } from "@workspace/db";
import { config } from "./config";
import { QA_RATING_VIEW, lectureNameIndex, matchDemoTopic } from "./demoTraining";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  if (!p?.teachosUserId) { console.log(`${emp}: not in the CRM or no TeachOS user id`); process.exit(0); }
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const V = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\``;
  const [rows] = await bq.query({ query: `SELECT CAST(session_date AS STRING) AS d, evaluation_type AS ty, status AS st, final_score AS s, session_title AS t,
      ROUND(SAFE_CAST(audio_duration AS FLOAT64) / 60, 1) AS mins, report_url IS NOT NULL AND report_url != '' AS rep, transcript_url IS NOT NULL AND transcript_url != '' AS tr,
      CAST(evaluation_creation_datetime AS STRING) AS created
    FROM ${V} WHERE instructor_user_id = @uid AND evaluation_type IN ('DEMO', 'TRAINING_DEMO', 'AI_ASSESSMENT', 'TRAINING_AI_ASSESSMENT') ORDER BY d, created`,
    params: { uid: p.teachosUserId } });
  const idx = lectureNameIndex();
  console.log(`${emp} · ${(rows as unknown[]).length} demo / AI evaluations\n`);
  console.log("date | type | status | score | mins | report | transcript | topic | matched course #lecture");
  const byCourse = new Map<string, { n: number; sum: number; scored: number; zero: number }>();
  for (const r of rows as Record<string, unknown>[]) {
    const hits = matchDemoTopic(idx, plain(r.t));
    const where = hits ? [...new Set(hits.map((h) => `${LECTURE_COURSES[h.ci].title} #${h.n}`))].join(" / ") : "not in lecture list";
    console.log(`  ${plain(r.d)} | ${plain(r.ty)} | ${plain(r.st)} | ${plain(r.s) || "-"} | ${plain(r.mins) || "-"} | ${r.rep ? "yes" : "no"} | ${r.tr ? "yes" : "no"} | ${plain(r.t)} | ${where}`);
    if (["DEMO", "TRAINING_DEMO"].includes(plain(r.ty)) && plain(r.st).toLowerCase() === "completed" && hits) {
      for (const ci of new Set(hits.map((h) => h.ci))) {
        const k = LECTURE_COURSES[ci].title, e = byCourse.get(k) ?? { n: 0, sum: 0, scored: 0, zero: 0 };
        e.n++; if (plain(r.s) !== "") { e.sum += Number(plain(r.s)); e.scored++; if (Number(plain(r.s)) === 0) e.zero++; }
        byCourse.set(k, e);
      }
    }
  }
  console.log("\nWhat the Demos tab works out (course: completed demos, of which score 0, average):");
  for (const [k, e] of byCourse) console.log(`  ${k}: ${e.n}, ${e.zero} at 0, avg ${e.scored ? (e.sum / e.scored).toFixed(2) : "-"}`);
  const stored = await db.select().from(instructorDemoCourseTable).where(eq(instructorDemoCourseTable.instructorUserId, p.teachosUserId)).catch(() => []);
  console.log(`Stored in the Demos tab now: ${stored.map((s) => `${s.courseTitle} ${s.lecturesDemoed}/${s.lecturesTotal}, ${s.demos} demos, avg ${s.scored ? (s.scoreSum / s.scored).toFixed(2) : "-"}`).join("; ") || "nothing"}`);
  const [z] = await bq.query({ query: `SELECT evaluation_type AS ty, COUNTIF(final_score = 0) AS zero, COUNT(*) AS n, COUNTIF(final_score = 0 AND (report_url IS NULL OR report_url = '')) AS zero_no_report
    FROM ${V} WHERE evaluation_type IN ('DEMO', 'TRAINING_DEMO') AND LOWER(status) = 'completed' GROUP BY 1` });
  console.log(`\nCompany-wide, completed demos with score exactly 0: ${(z as Record<string, unknown>[]).map((r) => `${plain(r.ty)} ${plain(r.zero)} of ${plain(r.n)} (${plain(r.zero_no_report)} of them without a report)`).join("; ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
