// One-off export (2026-10-07): dump BOTH BigQuery tables to CSV so they can be
// compared by hand: niat_instructor_details (the roster the sync matches
// against) and niat_instructor_managers_and_instructors_details (manager
// assignments). Saved to Downloads and to ./tmp (git-ignored). Read-only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const TABLES = ["niat_instructor_details", process.env.CAPABILITY_MANAGER_TABLE || "niat_instructor_managers_and_instructors_details"];

function toCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (typeof value === "object") {
    const v = value as { value?: unknown };
    s = v && "value" in v && v.value !== undefined ? String(v.value) : JSON.stringify(value);
  } else s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const projectId = config.BIGQUERY_PROJECT_ID;
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId });
  const tmpDir = path.resolve(process.cwd(), "tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const table of TABLES) {
    const ref = `${projectId}.${config.BIGQUERY_DATASET}.${table}`;
    const [rows] = await bq.query({ query: `SELECT * FROM \`${ref}\`` });
    console.log(`${ref}: ${rows.length} rows`);
    if (rows.length === 0) continue;
    const columns = Object.keys(rows[0] as Record<string, unknown>);
    const csv = [columns.join(","), ...rows.map((r) => columns.map((c) => toCell((r as Record<string, unknown>)[c])).join(","))].join("\n");
    for (const dir of [path.join(os.homedir(), "Downloads"), tmpDir]) {
      fs.writeFileSync(path.join(dir, `${table}.csv`), csv, "utf8");
    }
    console.log(`  saved ${table}.csv (Downloads + tmp/)`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
