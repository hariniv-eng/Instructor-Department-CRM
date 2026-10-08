// One-off (2026-10-07): the Overview's "Exception 2" (reviewed Exited/Absconded,
// still inTeachos) still lists people who were marked inactive in TeachOS
// yesterday. Checks, per person: (1) what OUR database says right now
// (inTeachos / inDarwin / teachosUserId), (2) what the BigQuery source
// (niat_instructor_details) says about their instructor_status -- the sync only
// sets inTeachos=true for rows with status ACTIVE, so if BigQuery still says
// ACTIVE the problem is the source, not our sync -- and (3) when the syncs
// last ran. Read-only.
import { desc } from "drizzle-orm";
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable, uploadsTable } from "@workspace/db";
import { config } from "./config";

async function main() {
  const live = await db.select().from(instructorsTable);
  const rows = live.filter((r) => (r.exitVerification === "exited" || r.exitVerification === "absconded") && r.inTeachos && r.classification !== "excluded_ops_managers");
  console.log(`Exception 2 right now (reviewed Exited/Absconded, inTeachos=true): ${rows.length}\n`);

  const uploads = await db.select().from(uploadsTable).orderBy(desc(uploadsTable.uploadedAt)).limit(40);
  console.log("Latest TeachOS / Darwin syncs:");
  for (const u of uploads.filter((x) => x.source === "TeachOS" || x.source === "Darwin").slice(0, 8)) console.log(`  ${u.uploadedAt.toISOString()} | ${u.source} | ${u.rowCount} rows`);

  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const table = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details"}`;
  const ids = rows.map((r) => r.teachosUserId).filter((x): x is string => !!x);
  const emp = rows.map((r) => r.employeeId).filter((x): x is string => !!x);
  const [bqRows] = await bq.query({
    query: `SELECT instructor_user_id, nw_instructor_id, instructor_name, instructor_status, institute_name FROM \`${table}\` WHERE instructor_user_id IN UNNEST(@ids) OR nw_instructor_id IN UNNEST(@emp)`,
    params: { ids, emp },
    types: { ids: ["STRING"], emp: ["STRING"] },
  });
  console.log(`\nBigQuery ${table}: ${bqRows.length} rows for these ${rows.length} people\n`);
  for (const r of rows.sort((a, b) => a.fullName.localeCompare(b.fullName))) {
    const mine = (bqRows as Array<Record<string, unknown>>).filter((b) => (r.teachosUserId && b.instructor_user_id === r.teachosUserId) || (r.employeeId && b.nw_instructor_id === r.employeeId));
    const statuses = mine.length ? mine.map((b) => `${b.instructor_status}(${b.institute_name ?? "-"})`).join(", ") : "NOT IN BIGQUERY";
    console.log(`${r.fullName} | ${r.employeeId} | user=${r.teachosUserId} | inDarwin=${r.inDarwin} | marked=${r.exitVerification} | BigQuery: ${statuses}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
