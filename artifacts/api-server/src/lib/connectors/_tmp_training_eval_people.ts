// One-off, READ-ONLY (2026-10-28, per request): every person who has recorded a TRAINING_DEMO or TRAINING_AI_ASSESSMENT
// (niat_session_wise_qa_rating), with their details, to check whether they are normal deployed instructors or instructors in training.
// Per person: employee ID, CRM product (NIAT (Deployed) / NIAT (Training) / ...), classification, subject, joining date, in Darwin /
// TeachOS, plus niat_instructor_details (role, status, institute type, institute) and their counts: training demos, training AI
// assessments (completed, avg score, first / last date) and normal DEMO / AI_ASSESSMENT counts.
// Console: summary by product + one line per person WITHOUT names. Full list WITH names: training_eval_people.csv (delete after download).
//   pnpm exec tsx src/lib/connectors/_tmp_training_eval_people.ts
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { productOf } from "../product";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const [rows] = await bq.query({ query: `
    WITH e AS (SELECT instructor_user_id AS uid, evaluation_type AS ty, LOWER(status) AS st, final_score AS sc, session_date AS d,
                      instructor_name AS vname, institute_type AS vit, institute_name AS vinst FROM \`${ds}.niat_session_wise_qa_rating\`),
         t AS (SELECT DISTINCT uid FROM e WHERE ty IN ('TRAINING_DEMO', 'TRAINING_AI_ASSESSMENT') AND uid IS NOT NULL)
    SELECT t.uid, ANY_VALUE(e.vname) AS vname, ANY_VALUE(e.vit) AS vit, ANY_VALUE(e.vinst) AS vinst,
      COUNTIF(ty = 'TRAINING_DEMO') AS td, COUNTIF(ty = 'TRAINING_DEMO' AND st = 'completed') AS td_ok, ROUND(AVG(IF(ty = 'TRAINING_DEMO' AND st = 'completed', sc, NULL)), 1) AS td_avg,
      COUNTIF(ty = 'TRAINING_AI_ASSESSMENT') AS ta, COUNTIF(ty = 'TRAINING_AI_ASSESSMENT' AND st = 'completed') AS ta_ok, ROUND(AVG(IF(ty = 'TRAINING_AI_ASSESSMENT' AND st = 'completed', sc, NULL)), 1) AS ta_avg,
      CAST(MIN(IF(ty LIKE 'TRAINING_%', d, NULL)) AS STRING) AS f, CAST(MAX(IF(ty LIKE 'TRAINING_%', d, NULL)) AS STRING) AS l,
      COUNTIF(ty = 'DEMO') AS demo, COUNTIF(ty = 'AI_ASSESSMENT') AS ai, COUNTIF(ty = 'SCHEDULE') AS sched, COUNTIF(ty = 'MOCK') AS mock
    FROM t JOIN e USING (uid) GROUP BY t.uid` });
  const [det] = await bq.query({ query: `SELECT instructor_user_id AS uid, instructor_name AS n, nw_instructor_id AS emp, instructor_role AS role, instructor_status AS st,
      instructor_category AS cat, institute_type AS it, institute_name AS inst FROM \`${ds}.niat_instructor_details\`` });
  const D = new Map((det as Record<string, unknown>[]).map((r) => [plain(r.uid), r]));
  const crm = new Map((await db.select().from(instructorsTable)).filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, p]));
  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const head = ["Name", "Employee ID", "CRM product", "CRM classification", "Subject", "Date of joining", "In Darwin", "In TeachOS", "Role (details)", "Status (details)",
    "Category (details)", "Institute type", "Institute", "Training demos", "completed", "avg score", "Training AI assessments", "completed", "avg score",
    "First training eval", "Last training eval", "Normal demos", "Normal AI assessments", "Classroom QA (SCHEDULE)", "Mocks"];
  const out = [head.map(esc).join(",")];
  const byProduct = new Map<string, number>();
  const lines: string[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const uid = plain(r.uid), d = D.get(uid), p = crm.get(uid);
    const product = p ? productOf(p) : "NOT IN CRM";
    byProduct.set(product, (byProduct.get(product) ?? 0) + 1);
    const emp = p?.employeeId || plain(d?.emp) || "-";
    const doj = p ? String((p as Record<string, unknown>).dateOfJoining ?? "") : "";
    const vals = [p?.fullName || plain(d?.n) || plain(r.vname), emp, product, p?.classification ?? "", p?.deptArea || p?.manualDeptArea || "", doj,
      p ? (p.inDarwin ? "yes" : "no") : "", p ? (p.inTeachos ? "yes" : "no") : "", plain(d?.role), plain(d?.st), plain(d?.cat), plain(d?.it) || plain(r.vit), plain(d?.inst) || plain(r.vinst),
      plain(r.td), plain(r.td_ok), plain(r.td_avg), plain(r.ta), plain(r.ta_ok), plain(r.ta_avg), plain(r.f), plain(r.l), plain(r.demo), plain(r.ai), plain(r.sched), plain(r.mock)];
    out.push(vals.map(esc).join(","));
    lines.push(`  ${emp} | ${product} | ${plain(d?.role) || "-"} / ${plain(d?.st) || "-"} / ${plain(d?.it) || plain(r.vit) || "-"} | joined ${doj || "-"} | ` +
      `train demo ${plain(r.td_ok)}/${plain(r.td)} (avg ${plain(r.td_avg) || "-"}) · train AI ${plain(r.ta_ok)}/${plain(r.ta)} (avg ${plain(r.ta_avg) || "-"}) · ` +
      `normal demo ${plain(r.demo)} · normal AI ${plain(r.ai)} · classroom QA ${plain(r.sched)}`);
  }
  console.log(`People with training demos / training AI assessments: ${rows.length}`);
  console.log(`By CRM product: ${[...byProduct].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}\n`);
  console.log("Employee ID | CRM product | role / status / institute type (details) | joined | counts");
  for (const l of lines.sort()) console.log(l);
  fs.writeFileSync("training_eval_people.csv", out.join("\n"));
  console.log(`\nFull list with names: training_eval_people.csv (has staff names -- delete after download).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
