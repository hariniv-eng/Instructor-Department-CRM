// One-off, READ-ONLY (2026-11-11, per request: "get the new instructor assessment table into FCC"). The table's name was not given, only
// its columns. Finds every table in the project's datasets that has the column assessment_best_user_percentage_score (unique to it), and
// prints its rows, instructors, assessments, exam types and date range. No names printed.
//   pnpm exec tsx src/lib/connectors/_tmp_find_assessment_table.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  // 2026-11-11: the table reads a Google Sheet (Drive) underneath -- "Permission denied while getting Drive credentials". Ask for the Drive
  // scope too; if it still fails, the sheet itself is not shared with this service account (its e-mail is printed below).
  const creds = config.BIGQUERY_CREDENTIALS_JSON ? JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) : undefined;
  console.log(`FCC's BigQuery service account: ${creds?.client_email ?? "(default credentials)"}`);
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(creds ? { credentials: creds } : {}),
    scopes: ["https://www.googleapis.com/auth/bigquery", "https://www.googleapis.com/auth/drive.readonly"] });
  const [datasets] = await bq.getDatasets();
  const found: string[] = [];
  for (const ds of datasets) {
    try {
      const [rows] = await bq.query({ query: `SELECT table_name FROM \`${config.BIGQUERY_PROJECT_ID}.${ds.id}.INFORMATION_SCHEMA.COLUMNS\` WHERE column_name = 'assessment_best_user_percentage_score'` });
      for (const r of rows as Record<string, unknown>[]) found.push(`${ds.id}.${plain(r.table_name)}`);
    } catch (e) { console.log(`  (could not search dataset ${ds.id}: ${(e as Error).message.slice(0, 120)})`); }
  }
  console.log(`Tables with the assessment columns: ${found.length ? found.join(", ") : "NONE (not visible to FCC's BigQuery account)"}`);
  for (const t of found) {
    const [s] = await bq.query({ query: `SELECT COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS ins, COUNT(DISTINCT organisation_assessment_id) AS asg,
      STRING_AGG(DISTINCT exam_type) AS types, CAST(MIN(exam_attempt_start_date) AS STRING) AS d0, CAST(MAX(exam_attempt_start_date) AS STRING) AS d1
      FROM \`${config.BIGQUERY_PROJECT_ID}.${t}\`` });
    const x = (s as Record<string, unknown>[])[0];
    console.log(`  ${t}: ${plain(x.n)} rows | ${plain(x.ins)} instructors | ${plain(x.asg)} assessments | exam types ${plain(x.types)} | ${plain(x.d0)} to ${plain(x.d1)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
