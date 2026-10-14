// One-off, READ-ONLY (2026-10-14): checks whether two BigQuery tables exist, in the configured dataset and in every other dataset of
// the project. Also lists any similarly named tables (with or without the "z_" prefix) and, for the ones found, their columns and row count.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_bq_table_exists_check.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const WANTED = ["z_niat_instructors_demo_qa_rating_details", "z_niat_instructor_day_wise_unit_wise_time_spent_details"];
const FUZZY = ["demo_qa", "rating_details", "time_spent", "day_wise_unit_wise"];

async function main() {
  const project = config.BIGQUERY_PROJECT_ID;
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: project, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: project });
  const [datasets] = await bq.getDatasets();
  const ids = datasets.map((d) => d.id!).filter(Boolean);
  console.log(`Project ${project}. Configured dataset: ${config.BIGQUERY_DATASET}. Datasets visible: ${ids.join(", ")}\n`);

  const found = new Map<string, string[]>(); // table -> datasets
  const similar: string[] = [];
  for (const ds of ids) {
    try {
      const [rows] = await bq.query({ query: `SELECT table_name, table_type FROM \`${project}.${ds}\`.INFORMATION_SCHEMA.TABLES` });
      for (const r of rows as { table_name: string; table_type: string }[]) {
        const name = r.table_name.toLowerCase();
        if (WANTED.includes(name)) found.set(name, [...(found.get(name) ?? []), ds]);
        else if (FUZZY.some((f) => name.includes(f)) || WANTED.some((w) => name === w.replace(/^z_/, ""))) similar.push(`${ds}.${r.table_name} (${r.table_type})`);
      }
    } catch (e) {
      console.log(`  Dataset "${ds}": could not list tables (${(e as Error).message.slice(0, 120)})`);
    }
  }

  for (const w of WANTED) {
    const where = found.get(w);
    console.log(where ? `FOUND     ${w}  in dataset(s): ${where.join(", ")}` : `NOT FOUND ${w}`);
  }
  console.log(`\nSimilarly named tables (${similar.length}):`);
  similar.forEach((s) => console.log(`  ${s}`));

  for (const [table, dss] of found) {
    for (const ds of dss) {
      const [meta] = await bq.dataset(ds).table(table).getMetadata();
      const cols = (meta.schema?.fields ?? []).map((f: { name: string; type: string }) => `${f.name} (${f.type})`);
      console.log(`\n${ds}.${table}: ${meta.numRows ?? "?"} rows, ${cols.length} columns\n  ${cols.join(", ")}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
