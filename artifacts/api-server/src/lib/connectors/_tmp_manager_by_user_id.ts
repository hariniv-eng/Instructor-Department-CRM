// One-off, READ-ONLY (2026-10-19, per request): instructors mapped to a Capability Manager's USER ID in the manager table, to give
// them that manager (CAPABILITY_MANAGER_BY_USER_ID -- ff6c284a-... = Akhilendar Reddy). Prints the manager table's columns, which
// column holds the manager's user id, then every instructor mapped to the given id: the manager NAME recorded on those rows, and what
// the app shows today. Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_manager_by_user_id.ts ff6c284a-ce5d-4a0b-979f-5a7f5a83ff45
import { BigQuery } from "@google-cloud/bigquery";
import { inArray } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { findManagerIdColumn, CAPABILITY_MANAGER_TABLE_NAME } from "./capabilityManager";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const id = (args[0] ?? "ff6c284a-ce5d-4a0b-979f-5a7f5a83ff45").replace(/-/g, "").toLowerCase().replace(/[^0-9a-f]/g, "");
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ref = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${CAPABILITY_MANAGER_TABLE_NAME}\``;
  const [cols] = await bq.query({ query: `SELECT column_name FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`, params: { t: CAPABILITY_MANAGER_TABLE_NAME } });
  const names = (cols as { column_name: string }[]).map((c) => c.column_name);
  console.log(`${CAPABILITY_MANAGER_TABLE_NAME} columns: ${names.join(", ")}`);
  const idCol = await findManagerIdColumn(bq);
  console.log(`Manager user id column the sync will use: ${idCol ?? "NONE FOUND"}\n`);
  // Search EVERY id-like column for the value, so we see where it really lives even if the column guess is wrong.
  const idLike = names.filter((n) => /id$/i.test(n));
  for (const c of idLike) {
    const [[r]] = await bq.query({ query: `SELECT COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS ins FROM ${ref} WHERE REPLACE(LOWER(CAST(${c} AS STRING)), '-', '') = @id`, params: { id } });
    const n = Number((r as { n: number }).n);
    if (n) console.log(`  value found in column ${c}: ${n} rows, ${(r as { ins: number }).ins} instructors`);
  }
  if (!idCol) { process.exit(0); }
  const [rows] = await bq.query({
    query: `SELECT DISTINCT instructor_user_id, instructor_manager FROM ${ref} WHERE REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '') = @id`,
    params: { id },
  });
  const uids = [...new Set((rows as { instructor_user_id: string }[]).map((r) => r.instructor_user_id).filter(Boolean))];
  const people = uids.length ? await db.select().from(instructorsTable).where(inArray(instructorsTable.teachosUserId, uids)) : [];
  const byUid = new Map(people.map((p) => [p.teachosUserId!, p]));
  console.log(`\nInstructors mapped to manager id ${id}: ${uids.length}`);
  console.log(`Name | Employee ID | Manager name on those rows | Capability Manager in the app today`);
  for (const uid of uids) {
    const p = byUid.get(uid);
    const recorded = [...new Set((rows as { instructor_user_id: string; instructor_manager: string | null }[]).filter((r) => r.instructor_user_id === uid).map((r) => r.instructor_manager || "(blank)"))].join(" / ");
    console.log(`${p?.fullName ?? "(not in app)"} | ${p?.employeeId ?? "-"} | ${recorded} | ${p ? (p.teachosManager || p.manualCapabilityManager || "-") : "-"}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
