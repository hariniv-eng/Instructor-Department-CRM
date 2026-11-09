// One-off, READ-ONLY (2026-11-09, per request: "training_demo data -- can I get instructors' average QA report"). From the QA view
// (niat_session_wise_qa_rating), TRAINING_DEMO and TRAINING_AI_ASSESSMENT only (the practice evaluations during training, recorded since
// ~6 Oct 2026), status Completed, one row per instructor:
//   training demos: count, different topics, average QA (all), count / average of recordings of 10 minutes or more, first / last date
//   training AI assessments: count, different topics, average AI score, first / last date
// plus employee ID, name, product, subject and Capability Manager from FCC. Writes training_demo_qa.csv in this folder -- it HAS STAFF
// NAMES: download it, then delete it from Replit (rm training_demo_qa.csv). The console shows totals only, no names.
//   pnpm exec tsx src/lib/connectors/_tmp_training_demo_qa.ts
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { QA_RATING_VIEW } from "./demoTraining";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const n = (v: unknown) => Number(plain(v)) || 0;
const avg = (v: unknown) => (plain(v) === "" ? "" : (Math.round(Number(plain(v)) * 100) / 100).toFixed(2));
const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;

async function main() {
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `
    WITH e AS (
      SELECT instructor_user_id AS uid, evaluation_type AS ty, LOWER(TRIM(session_title)) AS topic, SAFE_CAST(final_score AS FLOAT64) AS s,
             SAFE_CAST(audio_duration AS FLOAT64) / 60 AS mins, session_date AS d
      FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\`
      WHERE evaluation_type IN ('TRAINING_DEMO', 'TRAINING_AI_ASSESSMENT') AND LOWER(status) = 'completed' AND instructor_user_id IS NOT NULL)
    SELECT uid,
      COUNTIF(ty = 'TRAINING_DEMO') AS demos, COUNT(DISTINCT IF(ty = 'TRAINING_DEMO', topic, NULL)) AS demo_topics,
      AVG(IF(ty = 'TRAINING_DEMO', s, NULL)) AS demo_avg,
      COUNTIF(ty = 'TRAINING_DEMO' AND (mins IS NULL OR mins >= 10)) AS demos_10, AVG(IF(ty = 'TRAINING_DEMO' AND (mins IS NULL OR mins >= 10), s, NULL)) AS demo_avg_10,
      CAST(MIN(IF(ty = 'TRAINING_DEMO', d, NULL)) AS STRING) AS demo_first, CAST(MAX(IF(ty = 'TRAINING_DEMO', d, NULL)) AS STRING) AS demo_last,
      COUNTIF(ty = 'TRAINING_AI_ASSESSMENT') AS ai, COUNT(DISTINCT IF(ty = 'TRAINING_AI_ASSESSMENT', topic, NULL)) AS ai_topics,
      AVG(IF(ty = 'TRAINING_AI_ASSESSMENT', s, NULL)) AS ai_avg,
      CAST(MIN(IF(ty = 'TRAINING_AI_ASSESSMENT', d, NULL)) AS STRING) AS ai_first, CAST(MAX(IF(ty = 'TRAINING_AI_ASSESSMENT', d, NULL)) AS STRING) AS ai_last
    FROM e GROUP BY uid ORDER BY demo_avg DESC` });

  const people = await db.select().from(instructorsTable);
  const byUid = new Map(people.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, p]));
  const header = ["Employee ID", "Name", "Product", "Subject", "Capability Manager",
    "Training demos", "Different topics (demos)", "Average QA (all)", "Demos 10+ min", "Average QA (10+ min)", "First demo", "Last demo",
    "Training AI assessments", "Different topics (AI)", "Average AI score", "First AI", "Last AI", "In FCC"];
  const out = [header.map(esc).join(",")];
  let matched = 0, demosTotal = 0, aiTotal = 0;
  for (const r of rows as Record<string, unknown>[]) {
    const p = byUid.get(plain(r.uid));
    if (p) matched++;
    demosTotal += n(r.demos); aiTotal += n(r.ai);
    out.push([p?.employeeId ?? "", p?.fullName ?? "", p ? productOf(p) : "", p ? normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) ?? "" : "",
      p ? p.teachosManager || p.manualCapabilityManager || "" : "",
      n(r.demos), n(r.demo_topics), avg(r.demo_avg), n(r.demos_10), avg(r.demo_avg_10), plain(r.demo_first), plain(r.demo_last),
      n(r.ai), n(r.ai_topics), avg(r.ai_avg), plain(r.ai_first), plain(r.ai_last), p ? "yes" : "no (TeachOS id not in FCC)"].map(esc).join(","));
  }
  fs.writeFileSync("training_demo_qa.csv", "﻿" + out.join("\r\n"));
  console.log(`Instructors with training demos / AI assessments: ${(rows as unknown[]).length} (${matched} found in FCC)`);
  console.log(`Completed training demos: ${demosTotal} | completed training AI assessments: ${aiTotal}`);
  console.log(`Wrote training_demo_qa.csv (HAS STAFF NAMES -- download it, then: rm training_demo_qa.csv)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
