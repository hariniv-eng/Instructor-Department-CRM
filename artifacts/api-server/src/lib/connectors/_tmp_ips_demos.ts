// One-off, READ-ONLY (2026-10-28, per request: "check IPS with the demo / QA data"). Uses the demo + AI-assessment view
// niat_session_wise_qa_rating (evaluation_type DEMO / TRAINING_DEMO / AI_ASSESSMENT / TRAINING_AI_ASSESSMENT; session_id = topic ID,
// session_title = topic name, session_date, status, final_score 0-10). Finds evaluations on IPS:
//   - by ID: session_id is any unit of the IPS portal course (c51b2ebf..., all 231 units) or one of the 5 IPS module topic IDs
//   - by title only: session_title = an IPS lecture name but a different ID (same topic in another course)
// Prints totals per evaluation type and per IPS lecture (evaluations, instructors, completed, average score). With an employee ID it
// also lists that person's IPS evaluations. No staff names. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_ips_demos.ts
//   pnpm exec tsx src/lib/connectors/_tmp_ips_demos.ts NW0005054
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const VIEW = process.env.QA_RATING_VIEW || "niat_session_wise_qa_rating";
const IPS_COURSE = "c51b2ebfd6464680b868e731110ef183";
const IPS_TOPICS = ["193794be82a54c52a7d6baebef3bb6c1", "b9bc3259ef26466ca057f80057e9a4a8", "0a741e756097490f9e8409966f2256fa", "13bb0f2e8b204ddeb1ca8ab65f146ec4", "4aab724a5ea7473b805c7167437a2e33"];
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const nameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const NORM = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;
const TK = (c: string) => `REGEXP_REPLACE(REPLACE(LOWER(CAST(${c} AS STRING)), '&', 'and'), r'[^a-z0-9]', '')`;

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  const ips = LECTURE_COURSES.find((c) => c.key === "lecture_ips")!;
  const names = ips.lectures.map((l) => nameKey(l.name));
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const [cols] = await bq.query({ query: `SELECT column_name FROM \`${ds}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`, params: { t: VIEW } });
  console.log(`${VIEW} columns: ${(cols as { column_name: string }[]).map((c) => c.column_name).join(", ") || "(view not found)"}\n`);

  const base = `
    WITH ipsu AS (SELECT DISTINCT ${NORM("unit_id")} AS id
                  FROM \`${ds}.niat_instructor_unit_wise_completion_and_best_attempt_details\` WHERE ${NORM("course_id")} = @course),
    ev AS (SELECT instructor_user_id AS uid, evaluation_type AS ty, ${NORM("session_id")} AS sid, session_title AS st, ${TK("session_title")} AS tk,
                  CAST(session_date AS STRING) AS d, LOWER(CAST(status AS STRING)) AS status, SAFE_CAST(final_score AS FLOAT64) AS score
           FROM \`${ds}.${VIEW}\`)
    SELECT ev.*, CASE WHEN ev.sid IN (SELECT id FROM ipsu) OR ev.sid IN UNNEST(@topics) THEN 'id' WHEN ev.tk IN UNNEST(@names) THEN 'title' END AS how
    FROM ev WHERE ev.sid IN (SELECT id FROM ipsu) OR ev.sid IN UNNEST(@topics) OR ev.tk IN UNNEST(@names)`;
  const [rows] = await bq.query({ query: base, params: { course: IPS_COURSE, topics: IPS_TOPICS, names } });
  const R = rows as Record<string, unknown>[];
  const sum = (list: Record<string, unknown>[]) => {
    const sc = list.map((r) => Number(r.score)).filter((x) => Number.isFinite(x) && x > 0);
    return `${list.length} evals, ${new Set(list.map((r) => plain(r.uid))).size} instructors, ${list.filter((r) => /complet/.test(plain(r.status))).length} completed, avg score ${sc.length ? (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(1) : "-"}`;
  };
  for (const how of ["id", "title"]) {
    const part = R.filter((r) => plain(r.how) === how);
    console.log(how === "id" ? "Matched by IPS ID (IPS course unit or module topic):" : "\nMatched by title only (IPS topic name, other course's ID):");
    for (const ty of [...new Set(part.map((r) => plain(r.ty)))].sort()) console.log(`  ${ty}: ${sum(part.filter((r) => plain(r.ty) === ty))}`);
    if (!part.length) console.log("  none");
  }
  console.log(`\nPer IPS lecture (by ID | by title only):`);
  for (const l of ips.lectures) {
    const k = nameKey(l.name);
    const byId = R.filter((r) => plain(r.how) === "id" && (plain(r.tk) === k || l.unitIds.includes(plain(r.sid))));
    const byT = R.filter((r) => plain(r.how) === "title" && plain(r.tk) === k);
    if (byId.length || byT.length) console.log(`  #${l.n} ${l.name}: ${byId.length ? sum(byId) : "-"} | ${byT.length ? sum(byT) : "-"}`);
  }
  if (emp) {
    const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
    const mine = R.filter((r) => p?.teachosUserId && plain(r.uid) === p.teachosUserId);
    console.log(`\n${emp}: ${mine.length} IPS evaluations (date | type | status | score | topic | matched by)`);
    for (const r of mine.sort((a, b) => plain(a.d).localeCompare(plain(b.d)))) console.log(`  ${plain(r.d).slice(0, 10)} | ${plain(r.ty)} | ${plain(r.status)} | ${plain(r.score) || "-"} | ${plain(r.st)} | ${plain(r.how)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
