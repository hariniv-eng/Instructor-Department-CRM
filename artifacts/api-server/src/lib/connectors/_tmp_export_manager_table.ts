// One-off export (2026-10-06): dump the BigQuery manager/instructor roster
// table to a CSV in the user's Downloads folder. There is no table named
// exactly "niat_manager_instructor" referenced anywhere in this app -- the
// manager<->instructor table the app uses is
// niat_instructor_managers_and_instructors_details (capabilityManager.ts),
// so that's what gets exported. Also lists every table in the dataset whose
// name contains "manager", so if the user meant a different one it shows up
// right here. Read-only: runs SELECT queries only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const TABLE = process.env.CAPABILITY_MANAGER_TABLE || "niat_instructor_managers_and_instructors_details";

function toCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (typeof value === "object") {
    const v = value as { value?: unknown };
    s = v && "value" in v && v.value !== undefined ? String(v.value) : JSON.stringify(value);
  } else {
    s = String(value);
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const projectId = config.BIGQUERY_PROJECT_ID;
  const dataset = config.BIGQUERY_DATASET;
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId });

  const [tables] = await bq.dataset(dataset).getTables();
  const managerTables = tables.map((t) => t.id ?? "").filter((id) => /manager/i.test(id));
  console.log(`Tables in ${projectId}.${dataset} with "manager" in the name:`);
  for (const id of managerTables) console.log(`  ${id}`);

  const ref = `${projectId}.${dataset}.${TABLE}`;
  const [rows] = await bq.query({ query: `SELECT * FROM \`${ref}\`` });
  console.log(`\n${ref}: ${rows.length} rows`);
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0] as Record<string, unknown>);
  console.log("Columns:", columns.join(", "));
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => toCell((r as Record<string, unknown>)[c])).join(","))];
  const outPath = path.join(os.homedir(), "Downloads", `${TABLE}.csv`);
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`\nSaved: ${outPath}`);
  // Second copy inside the project folder (tmp/ is git-ignored) so Claude
  // can pick the file up from the connected folder and send it back.
  const projectCopyDir = path.resolve(process.cwd(), "tmp");
  fs.mkdirSync(projectCopyDir, { recursive: true });
  const projectCopy = path.join(projectCopyDir, `${TABLE}.csv`);
  fs.writeFileSync(projectCopy, lines.join("\n"), "utf8");
  console.log(`Also saved: ${projectCopy}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
