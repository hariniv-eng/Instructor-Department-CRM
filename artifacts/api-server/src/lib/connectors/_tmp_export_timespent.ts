// One-off, READ-ONLY (2026-10-15): exports z_niat_instructor_day_wise_unit_wise_time_spent_details to CSV files you can download.
// The table has ~1.26 million rows, more than one Excel sheet holds (1,048,576), so the full export is split into parts of 500,000 rows.
//   Full table, every column:            pnpm exec tsx src/lib/connectors/_tmp_export_timespent.ts
//   One row per instructor per day:      pnpm exec tsx src/lib/connectors/_tmp_export_timespent.ts --summary
// Run from artifacts/api-server in the Replit shell. Files land in <repo>/tmp/timespent-export/ (git-ignored) -- download them from the
// Replit file tree (right-click > Download), then delete the folder.
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { config } from "./config";

const TABLE = "z_niat_instructor_day_wise_unit_wise_time_spent_details";
const ROWS_PER_FILE = 100_000;

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const raw = typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v;
  const text = String(raw);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function main() {
  const summary = process.argv.includes("--summary");
  const project = config.BIGQUERY_PROJECT_ID;
  const ds = config.BIGQUERY_DATASET;
  const bq = config.BIGQUERY_CREDENTIALS_JSON ? new BigQuery({ projectId: project, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) }) : new BigQuery({ projectId: project });
  const ref = `\`${project}.${ds}.${TABLE}\``;
  const query = summary
    ? `SELECT instructor_user_id, ANY_VALUE(instructor_name) AS instructor_name, ANY_VALUE(institute_name) AS institute_name, date,
              COUNT(DISTINCT unit_id) AS units, ROUND(SUM(datewise_total_time_spent_in_sec), 1) AS total_seconds, ROUND(SUM(datewise_total_time_spent_in_sec) / 3600, 2) AS total_hours
       FROM ${ref} WHERE date IS NOT NULL GROUP BY instructor_user_id, date ORDER BY instructor_user_id, date`
    : `SELECT * FROM ${ref} ORDER BY instructor_user_id, date, course_id, unit_id`;

  const dir = path.resolve(process.cwd(), "../../tmp/timespent-export");
  fs.mkdirSync(dir, { recursive: true });
  const base = summary ? "time_spent_per_instructor_per_day" : "time_spent_unit_wise";

  let header: string[] | null = null;
  let part = 0;
  let inPart = 0;
  let total = 0;
  let out: fs.WriteStream | null = null;
  const files: string[] = [];

  const openPart = () => {
    part += 1;
    inPart = 0;
    const file = path.join(dir, `${base}_part${String(part).padStart(2, "0")}.csv`);
    files.push(file);
    out = fs.createWriteStream(file, { encoding: "utf8" });
    out.write("﻿" + header!.join(",") + "\r\n");
  };
  const closePart = async () => {
    if (!out) return;
    out.end();
    await once(out, "finish");
    out = null;
  };

  console.log(summary ? "Exporting one row per instructor per day..." : "Exporting every row of the table (this takes a few minutes)...");
  const stream = bq.createQueryStream({ query });
  for await (const row of stream as AsyncIterable<Record<string, unknown>>) {
    if (!header) header = Object.keys(row);
    if (!out || inPart >= ROWS_PER_FILE) {
      await closePart();
      openPart();
    }
    if (!out!.write(header.map((k) => cellText(row[k])).join(",") + "\r\n")) await once(out!, "drain");
    inPart += 1;
    total += 1;
    if (total % 100_000 === 0) console.log(`  ${total.toLocaleString("en-IN")} rows...`);
  }
  await closePart();
  console.log(`\nDone: ${total.toLocaleString("en-IN")} rows in ${files.length} file(s):`);
  for (const f of files) console.log(`  ${f}  (${(fs.statSync(f).size / 1048576).toFixed(1)} MB)`);
  console.log("\nDownload them from the Replit file tree (tmp/timespent-export), then delete that folder.");
}

main().catch((e) => { console.error("FAILED:", (e as Error).message); process.exit(1); });
