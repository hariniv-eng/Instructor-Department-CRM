// One-off, READ-ONLY (2026-11-12, per request: "check the readiness against the topin assessment data"). The assessment view is now
// readable. Prints its columns and types, and for every text / number column the number of distinct values plus the top 15 values
// (skipped for columns that look like names, emails or phone numbers) -- to see how exams, courses, topics and scores are recorded
// before building the Frontend comparison. No staff names are printed.
//   pnpm exec tsx src/lib/connectors/_tmp_topin_schema.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.niat_instructor_automation_data.z_niat_tech_instrctor_trainee_exam_best_scores_details\``;
  const [rows] = await bq.query({ query: `SELECT * FROM ${T} LIMIT 1` });
  const sample = (rows as Record<string, unknown>[])[0] ?? {};
  const cols = Object.keys(sample);
  console.log(`Columns (${cols.length}): ${cols.join(", ")}\n`);
  const sensitive = /name|email|mail|phone|mobile|contact/i;
  for (const c of cols) {
    const [d] = await bq.query({ query: `SELECT COUNT(DISTINCT CAST(\`${c}\` AS STRING)) AS n, COUNTIF(\`${c}\` IS NULL) AS empties, MIN(CAST(\`${c}\` AS STRING)) AS lo, MAX(CAST(\`${c}\` AS STRING)) AS hi FROM ${T}` });
    const s = (d as Record<string, unknown>[])[0];
    const head = `${c}: distinct ${plain(s.n)} | empty ${plain(s.empties)}`;
    if (sensitive.test(c)) { console.log(`${head} | (values not shown)`); continue; }
    if (/(^|_)id$|user_id|uuid/i.test(c) && Number(plain(s.n)) > 50) { console.log(`${head} | ids (values not shown)`); continue; }
    if (Number(plain(s.n)) > 60) { console.log(`${head} | min ${plain(s.lo).slice(0, 40)} | max ${plain(s.hi).slice(0, 40)}`); continue; }
    const [top] = await bq.query({ query: `SELECT CAST(\`${c}\` AS STRING) AS v, COUNT(*) AS n FROM ${T} GROUP BY v ORDER BY n DESC LIMIT 15` });
    console.log(`${head}\n     ${(top as Record<string, unknown>[]).map((t) => `${plain(t.v).slice(0, 60) || "(blank)"} [${plain(t.n)}]`).join(" | ")}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
