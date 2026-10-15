import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const raw = typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v;
  const text = String(raw);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function main() {
  const project = config.BIGQUERY_PROJECT_ID;
  const ds = config.BIGQUERY_DATASET;
  const bq = config.BIGQUERY_CREDENTIALS_JSON ? new BigQuery({ projectId: project, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) }) : new BigQuery({ projectId: project });
  const [rows] = await bq.query({ query: `SELECT * FROM \`${project}.${ds}.z_niat_instructor_day_wise_unit_wise_time_spent_details\` ORDER BY date DESC, instructor_user_id, unit_id LIMIT 1000` });
  const header = Object.keys(rows[0]);
  const csv = "\ufeff" + [header.join(","), ...rows.map((r: Record<string, unknown>) => header.map((k) => cellText(r[k])).join(","))].join("\r\n");
  const dir = path.resolve(process.cwd(), "../../tmp");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "time_spent_sample_1000_rows.csv");
  fs.writeFileSync(file, csv);
  console.log(`Wrote ${rows.length} rows to ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}
main().catch((e) => { console.error("FAILED:", (e as Error).message); process.exit(1); });
