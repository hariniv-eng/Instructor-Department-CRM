// One-off, READ-ONLY (2026-10-14): lists EVERY column (name, type, mode) of the two z_ tables and prints 10 sample rows from each,
// plus, for text columns with few distinct values, those values and counts, so you can see what each column holds.
// Run in the Replit shell from artifacts/api-server (pass a table name to do just one):
//   pnpm exec tsx src/lib/connectors/_tmp_bq_table_profile.ts
//   pnpm exec tsx src/lib/connectors/_tmp_bq_table_profile.ts z_niat_instructors_demo_qa_rating_details
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const TABLES = ["z_niat_instructors_demo_qa_rating_details", "z_niat_instructor_day_wise_unit_wise_time_spent_details"];

async function main() {
  const project = config.BIGQUERY_PROJECT_ID;
  const ds = config.BIGQUERY_DATASET;
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: project, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: project });
  const only = process.argv[2];
  for (const table of TABLES.filter((t) => !only || t === only)) {
    const ref = `\`${project}.${ds}.${table}\``;
    const [meta] = await bq.dataset(ds!).table(table).getMetadata();
    const fields: { name: string; type: string; mode?: string }[] = meta.schema?.fields ?? [];
    console.log(`\n==================== ${table} (${meta.type}) ====================`);
    console.log(`COLUMNS (${fields.length}):`);
    fields.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. ${f.name}  [${f.type}${f.mode && f.mode !== "NULLABLE" ? ", " + f.mode : ""}]`));

    console.log("\nSAMPLE ROWS (10, newest first where a date column exists):");
    const dateCol = fields.find((f) => ["session_date", "date"].includes(f.name))?.name;
    const [rows] = await bq.query({ query: `SELECT * FROM ${ref} ${dateCol ? `ORDER BY ${dateCol} DESC` : ""} LIMIT 10` });
    rows.forEach((r, i) => console.log(`  --- row ${i + 1} ---\n` + Object.entries(r).map(([k, v]) => `    ${k}: ${v !== null && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : JSON.stringify(v)}`).join("\n")));

    console.log("\nVALUES IN TEXT COLUMNS WITH FEW DISTINCT VALUES (top 12 each):");
    for (const f of fields.filter((x) => x.type === "STRING")) {
      const [d] = await bq.query({ query: `SELECT COUNT(DISTINCT ${f.name}) AS n FROM ${ref}` });
      const n = Number(d[0]?.n ?? 0);
      if (n === 0 || n > 40) { console.log(`  ${f.name}: ${n} distinct values (not listed)`); continue; }
      const [v] = await bq.query({ query: `SELECT ${f.name} AS value, COUNT(*) AS c FROM ${ref} GROUP BY 1 ORDER BY c DESC LIMIT 12` });
      console.log(`  ${f.name}: ${v.map((x) => `${x.value} (${x.c})`).join(", ")}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
