// One-off, READ-ONLY (2026-10-22, per request: "why is the TeachOS data we get not updated yet?"). The app never reads TeachOS
// directly: it reads BigQuery COPIES of TeachOS that a data pipeline refreshes on its own schedule. This prints, for every BigQuery
// table the app reads, when that copy was last written (BigQuery's own lastModifiedTime) and its row count, next to when the app last
// synced it -- so you can see whether a change made in TeachOS has reached BigQuery yet. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_bq_freshness.ts
import { BigQuery } from "@google-cloud/bigquery";
import { desc } from "drizzle-orm";
import { db, uploadsTable } from "@workspace/db";
import { config } from "./config";

const ist = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const TABLES: [string, string, string][] = [
  [config.BIGQUERY_DATASET!, process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details", "TeachOS accounts (status, campus, employee id)"],
  [process.env.NIAT_REVERSE_ETL_DATASET || "niat_reverse_etl_bases", process.env.NIAT_REVERSE_ETL_TABLE || "niat_instructor_details", "TeachOS enrolled plans"],
  [config.BIGQUERY_DATASET!, process.env.CAPABILITY_MANAGER_TABLE || "niat_instructor_managers_and_instructors_details", "Capability Manager mapping"],
  [config.BIGQUERY_DATASET!, "niat_instructor_session_schedule_details", "Sessions (Contribution, Taught in class)"],
  [config.BIGQUERY_DATASET!, "niat_instructor_unit_wise_completion_and_best_attempt_details", "Training (learning portal)"],
];

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  console.log(`Now: ${ist(Date.now())} IST\n`);
  for (const [ds, t, label] of TABLES) {
    try {
      const [meta] = await bq.dataset(ds).table(t).getMetadata();
      const m = Number(meta.lastModifiedTime);
      console.log(`${label}\n  ${ds}.${t}: last written by the pipeline ${ist(m)} IST (${((Date.now() - m) / 3600000).toFixed(1)} h ago) | ${meta.numRows ?? meta.type} rows | type ${meta.type}`);
    } catch (e) {
      console.log(`${label}\n  ${ds}.${t}: could not read (${(e as Error).message.slice(0, 160)})`);
    }
  }
  const recent = await db.select().from(uploadsTable).orderBy(desc(uploadsTable.uploadedAt)).limit(200);
  console.log("\nLast time the APP synced each source:");
  for (const src of ["TeachOS", "NIAT Instructor Details", "Instructor Contribution", "Instructor Training Status"]) {
    const r = recent.find((u) => u.source === src);
    console.log(`  ${src}: ${r ? `${ist(r.uploadedAt.getTime())} IST (${r.rowCount} rows)` : "not in the last 200 syncs"}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
