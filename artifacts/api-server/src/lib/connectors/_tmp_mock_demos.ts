// One-off, READ-ONLY (2026-11-17, per request: "do we have any demos categorized as mock demos?"). MOCK rows in niat_session_wise_qa_rating
// (FCC does not count them anywhere today):
//   1. per month: MOCK vs DEMO vs TRAINING_DEMO completed rows and instructors (is MOCK the old name of demos, or still used next to them?)
//   2. MOCK length / score, institute type and instructor category / role (who records them)
//   3. how many MOCK topics match a lecture of FCC's lecture lists (same matching as Training - Demos), top titles
//   4. NIAT (Training) / NIAT (Deployed) instructors in FCC with MOCK rows in the last 90 days
// Counts and titles only, no names.
//   pnpm exec tsx src/lib/connectors/_tmp_mock_demos.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { QA_RATING_VIEW, lectureNameIndex, matchDemoTopic } from "./demoTraining";
import { productOf } from "../product";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const V = `\`${P}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\``;
  const done = "UPPER(status) = 'COMPLETED'";

  console.log("1. Completed rows per month (rows / instructors):  MOCK | DEMO | TRAINING_DEMO");
  const [m] = await bq.query({ query: `SELECT FORMAT_DATE('%Y-%m', SAFE_CAST(session_date AS DATE)) mo,
      COUNTIF(evaluation_type = 'MOCK') mk, COUNT(DISTINCT IF(evaluation_type = 'MOCK', instructor_user_id, NULL)) mkp,
      COUNTIF(evaluation_type = 'DEMO') dm, COUNT(DISTINCT IF(evaluation_type = 'DEMO', instructor_user_id, NULL)) dmp,
      COUNTIF(evaluation_type = 'TRAINING_DEMO') td, COUNT(DISTINCT IF(evaluation_type = 'TRAINING_DEMO', instructor_user_id, NULL)) tdp
    FROM ${V} WHERE ${done} AND evaluation_type IN ('MOCK', 'DEMO', 'TRAINING_DEMO') GROUP BY 1 ORDER BY 1` });
  for (const r of m as Record<string, unknown>[]) console.log(`   ${plain(r.mo) || "(no date)"}:  ${plain(r.mk)} / ${plain(r.mkp)}  |  ${plain(r.dm)} / ${plain(r.dmp)}  |  ${plain(r.td)} / ${plain(r.tdp)}`);

  console.log("\n2. MOCK (completed): length, score, who");
  const [s] = await bq.query({ query: `SELECT APPROX_QUANTILES(SAFE_CAST(audio_duration AS FLOAT64) / 60, 4) q, AVG(SAFE_CAST(final_score AS FLOAT64)) sc,
      COUNTIF(SAFE_CAST(audio_duration AS FLOAT64) < 600) short, COUNT(*) n FROM ${V} WHERE ${done} AND evaluation_type = 'MOCK'` });
  const x = (s as Record<string, unknown>[])[0];
  console.log(`   minutes (min / 25% / median / 75% / max): ${((x.q as unknown[]) ?? []).map((v) => Math.round(Number(plain(v)) * 10) / 10).join(" / ")} | under 10 min ${plain(x.short)} of ${plain(x.n)} | avg score ${Math.round(Number(plain(x.sc)) * 100) / 100}`);
  for (const col of ["institute_type", "instructor_category", "instructor_role", "analysis_type"]) {
    const [g] = await bq.query({ query: `SELECT CAST(${col} AS STRING) v, COUNT(*) n FROM ${V} WHERE ${done} AND evaluation_type = 'MOCK' GROUP BY 1 ORDER BY n DESC LIMIT 6` });
    console.log(`   ${col}: ${(g as Record<string, unknown>[]).map((r) => `${plain(r.v) || "(blank)"} ${plain(r.n)}`).join(" | ")}`);
  }

  console.log("\n3. MOCK topics vs FCC lecture lists");
  const [t] = await bq.query({ query: `SELECT session_title t, COUNT(*) n FROM ${V} WHERE ${done} AND evaluation_type = 'MOCK' GROUP BY 1 ORDER BY n DESC` });
  const idx = lectureNameIndex();
  let hit = 0, all = 0;
  for (const r of t as Record<string, unknown>[]) { const n = Number(plain(r.n)); all += n; if (matchDemoTopic(idx, plain(r.t))) hit += n; }
  console.log(`   ${hit} of ${all} MOCK rows have a topic that matches a lecture (${all ? Math.round((hit / all) * 100) : 0}%)`);
  console.log(`   top titles: ${(t as Record<string, unknown>[]).slice(0, 15).map((r) => `${plain(r.t)} (${plain(r.n)})`).join("; ")}`);

  console.log("\n4. FCC NIAT instructors with MOCK rows in the last 90 days");
  const [u] = await bq.query({ query: `SELECT instructor_user_id u, COUNT(*) n, MAX(CAST(session_date AS STRING)) last FROM ${V}
    WHERE ${done} AND evaluation_type = 'MOCK' AND SAFE_CAST(session_date AS DATE) >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) GROUP BY 1` });
  const people = new Map((await db.select().from(instructorsTable)).filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, p]));
  const byProduct = new Map<string, { people: number; rows: number }>();
  for (const r of u as Record<string, unknown>[]) {
    const p = people.get(plain(r.u));
    const k = p ? productOf(p) : "not in FCC";
    const y = byProduct.get(k) ?? { people: 0, rows: 0 }; y.people++; y.rows += Number(plain(r.n)); byProduct.set(k, y);
  }
  for (const [k, y] of [...byProduct].sort((a, b) => b[1].rows - a[1].rows)) console.log(`   ${k}: ${y.people} instructors, ${y.rows} MOCK rows`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
