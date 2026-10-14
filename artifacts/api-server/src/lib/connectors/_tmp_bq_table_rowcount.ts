// One-off, READ-ONLY (2026-10-14): real row counts, date ranges and a few sample rows for the two z_ tables (table metadata said 0 rows).
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_bq_table_rowcount.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

async function main() {
  const project = config.BIGQUERY_PROJECT_ID;
  const ds = config.BIGQUERY_DATASET;
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: project, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: project });
  const jobs: { table: string; dateCol: string; extra: string }[] = [
    { table: "z_niat_instructors_demo_qa_rating_details", dateCol: "session_date", extra: "COUNT(DISTINCT instructor_user_id) AS instructors, COUNT(DISTINCT evaluation_id) AS evaluations, AVG(final_score) AS avg_score" },
    { table: "z_niat_instructor_day_wise_unit_wise_time_spent_details", dateCol: "date", extra: "COUNT(DISTINCT instructor_user_id) AS instructors, COUNT(DISTINCT course_id) AS courses, SUM(datewise_total_time_spent_in_sec) AS total_seconds" },
  ];
  for (const j of jobs) {
    const ref = `\`${project}.${ds}.${j.table}\``;
    const [meta] = await bq.dataset(ds!).table(j.table).getMetadata();
    console.log(`\n${j.table}  (type ${meta.type}, last modified ${meta.lastModifiedTime ? new Date(Number(meta.lastModifiedTime)).toISOString() : "?"})`);
    const [rows] = await bq.query({ query: `SELECT COUNT(*) AS n, MIN(${j.dateCol}) AS first_date, MAX(${j.dateCol}) AS last_date, ${j.extra} FROM ${ref}` });
    console.log("  summary:", JSON.stringify(rows[0]));
    const [sample] = await bq.query({ query: `SELECT * FROM ${ref} LIMIT 3` });
    sample.forEach((r) => console.log("  sample:", JSON.stringify(r).slice(0, 400)));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
