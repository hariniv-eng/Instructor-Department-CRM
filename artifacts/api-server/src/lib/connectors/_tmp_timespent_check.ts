// One-off, READ-ONLY (2026-10-15): looks inside z_niat_instructor_day_wise_unit_wise_time_spent_details before we total it. Prints every
// column, a few rows for one busy instructor-day, and tests whether the time column is a PER-ROW amount (safe to add up) or a per-day
// total repeated on every unit row (adding it up would count the same time many times).
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_timespent_check.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const TABLE = "z_niat_instructor_day_wise_unit_wise_time_spent_details";

async function main() {
  const project = config.BIGQUERY_PROJECT_ID;
  const ds = config.BIGQUERY_DATASET;
  const bq = config.BIGQUERY_CREDENTIALS_JSON ? new BigQuery({ projectId: project, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) }) : new BigQuery({ projectId: project });
  const ref = `\`${project}.${ds}.${TABLE}\``;
  const [meta] = await bq.dataset(ds!).table(TABLE).getMetadata();
  const fields: { name: string; type: string }[] = meta.schema?.fields ?? [];
  console.log(`COLUMNS (${fields.length}):`);
  fields.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. ${f.name} [${f.type}]`));
  const timeCol = fields.find((f) => /time_spent/.test(f.name))?.name ?? "datewise_total_time_spent_in_sec";
  console.log(`\nTime column assumed: ${timeCol}`);

  const [pair] = await bq.query({ query: `SELECT instructor_user_id, date, COUNT(*) AS n FROM ${ref} GROUP BY 1, 2 HAVING COUNT(*) >= 3 ORDER BY date DESC LIMIT 1` });
  if (pair[0]) {
    const day = (pair[0].date as { value?: string })?.value ?? String(pair[0].date);
    console.log(`\nAll rows for one instructor-day (${pair[0].instructor_user_id}, ${day}, ${pair[0].n} rows):`);
    const [rows] = await bq.query({ query: `SELECT * FROM ${ref} WHERE instructor_user_id = @u AND date = @d`, params: { u: pair[0].instructor_user_id, d: day } });
    rows.slice(0, 12).forEach((r, i) => console.log(`  row ${i + 1}: ` + Object.entries(r).map(([k, v]) => `${k}=${v !== null && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : JSON.stringify(v)}`).join(" | ")));
  }

  const [stats] = await bq.query({
    query: `
      SELECT COUNT(*) AS instructor_days,
             COUNTIF(rows_n > 1) AS multi_row_days,
             COUNTIF(rows_n > 1 AND distinct_values = 1) AS multi_row_days_all_same_value
      FROM (SELECT instructor_user_id, date, COUNT(*) AS rows_n, COUNT(DISTINCT ${timeCol}) AS distinct_values FROM ${ref} GROUP BY 1, 2)`,
  });
  console.log("\nINSTRUCTOR-DAY SHAPE:", JSON.stringify(stats[0]));
  console.log("  (if nearly all multi-row days have ONE repeated value, the column is a per-day total repeated on each row)");

  const [tot] = await bq.query({ query: `SELECT COUNT(DISTINCT instructor_user_id) AS instructors, MIN(date) AS first_day, MAX(date) AS last_day, SUM(${timeCol}) AS sum_all_rows_sec FROM ${ref}` });
  console.log("TOTALS:", JSON.stringify(tot[0]));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
