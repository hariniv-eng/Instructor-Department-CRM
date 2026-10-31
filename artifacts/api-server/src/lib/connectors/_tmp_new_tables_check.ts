// One-off, READ-ONLY (2026-10-31, per request: "are these two newly added BigQuery tables there, and can we read them?"):
//   z_niat_users_live_classess_attendance_and_time_spent_details, z_niat_live_session_student_feedback_details
// For every dataset our credentials can see: does a table with that name (or a similar name -- spelling may differ) exist; its type,
// columns, row count and date range; and whether a SELECT actually works (permission). Prints no row data. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_new_tables_check.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const WANT = ["z_niat_users_live_classess_attendance_and_time_spent_details", "z_niat_live_session_student_feedback_details"];
async function main() {
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const project = config.BIGQUERY_PROJECT_ID!;
  console.log(`Project ${project}, app's dataset ${config.BIGQUERY_DATASET}\n`);
  const [datasets] = await bq.getDatasets();
  const found: { ds: string; name: string; type: string }[] = [];
  for (const d of datasets) {
    try {
      const [t] = await bq.query({ query: `SELECT table_name, table_type FROM \`${project}.${d.id}.INFORMATION_SCHEMA.TABLES\`
        WHERE table_name IN UNNEST(@w) OR REGEXP_CONTAINS(LOWER(table_name), r'live_class|live_session|student_feedback|attendance')`, params: { w: WANT } });
      for (const r of t as { table_name: string; table_type: string }[]) found.push({ ds: d.id!, name: r.table_name, type: r.table_type });
    } catch (e) { console.log(`  (cannot list dataset ${d.id}: ${(e as Error).message.slice(0, 120)})`); }
  }
  for (const w of WANT) {
    const exact = found.filter((f) => f.name === w);
    console.log(`${w}: ${exact.length ? exact.map((f) => `${f.ds} (${f.type})`).join(", ") : "NOT FOUND with this exact name"}`);
  }
  const similar = found.filter((f) => !WANT.includes(f.name));
  if (similar.length) { console.log("\nSimilar names (live class / live session / feedback / attendance):"); for (const f of similar) console.log(`  ${f.ds}.${f.name} (${f.type})`); }

  for (const f of found.filter((x) => WANT.includes(x.name))) {
    console.log(`\n== ${f.ds}.${f.name} (${f.type})`);
    try {
      const [c] = await bq.query({ query: `SELECT column_name, data_type FROM \`${project}.${f.ds}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`, params: { t: f.name } });
      const cols = c as { column_name: string; data_type: string }[];
      console.log(`  columns (${cols.length}): ${cols.map((x) => `${x.column_name} (${x.data_type})`).join(", ")}`);
      const dateCol = cols.find((x) => /DATE|TIMESTAMP/.test(x.data_type))?.column_name;
      const [n] = await bq.query({ query: `SELECT COUNT(*) AS n${dateCol ? `, CAST(MIN(${dateCol}) AS STRING) AS f, CAST(MAX(${dateCol}) AS STRING) AS l` : ""} FROM \`${project}.${f.ds}.${f.name}\`` });
      const r = (n as Record<string, unknown>[])[0];
      console.log(`  READ OK -- rows ${String(r.n)}${dateCol ? `, ${dateCol} ${String(r.f)} .. ${String(r.l)}` : ""}`);
    } catch (e) {
      console.log(`  CANNOT READ: ${(e as Error).message.slice(0, 300)}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
