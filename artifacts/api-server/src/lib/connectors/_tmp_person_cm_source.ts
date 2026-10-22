// One-off, READ-ONLY (2026-10-19, per request: "Abhishek Sharma NW0007197 has no TeachOS record, so how is a Capability Manager mapped
// to him?"). The app shows Capability Manager = teachosManager (from the TeachOS manager table, by TeachOS user id) OR, when that is
// empty, manualCapabilityManager (picked by hand on the Instructors tab). The Instructor Archive keeps the last known value. This prints
// both, for the live record and the archive, plus whether the manager table still has rows for his TeachOS user id. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_person_cm_source.ts NW0007197
import { BigQuery } from "@google-cloud/bigquery";
import { eq, ilike, or } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { config } from "./config";
import { CAPABILITY_MANAGER_TABLE_NAME } from "./capabilityManager";

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "NW0007197").trim().toUpperCase();
  const live = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  const sameName = live[0] ? await db.select().from(instructorsTable).where(or(ilike(instructorsTable.fullName, live[0].fullName))) : [];
  const archived = await db.select().from(instructorArchiveTable).where(eq(instructorArchiveTable.employeeId, emp));
  const show = (label: string, p: Record<string, unknown>) => {
    console.log(`--- ${label}`);
    for (const k of ["id", "employeeId", "fullName", "designation", "department", "classification", "inDarwin", "inTeachos", "teachosUserId", "teachosRole", "teachosManager", "manualCapabilityManager", "institutes", "inArchiveScope", "lastSyncedAt"]) {
      if (k in p) console.log(`  ${k}: ${JSON.stringify(p[k])}`);
    }
  };
  if (!live.length) console.log(`${emp}: no live record`);
  live.forEach((p) => show("LIVE record", p as unknown as Record<string, unknown>));
  sameName.filter((p) => p.employeeId !== emp).forEach((p) => show(`OTHER live record with the same name`, p as unknown as Record<string, unknown>));
  archived.forEach((p) => show("ARCHIVE record", p as unknown as Record<string, unknown>));
  const ids = [...new Set([...live, ...archived].map((p) => p.teachosUserId).filter((x): x is string => !!x))];
  if (ids.length) {
    const bq = config.BIGQUERY_CREDENTIALS_JSON
      ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
      : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
    const [rows] = await bq.query({ query: `SELECT * FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${CAPABILITY_MANAGER_TABLE_NAME}\` WHERE instructor_user_id IN UNNEST(@ids) LIMIT 20`, params: { ids } });
    console.log(`\nManager-table rows for TeachOS id(s) ${ids.join(", ")}: ${rows.length}`);
    for (const r of rows as Record<string, unknown>[]) console.log(`  ${JSON.stringify(r)}`);
  } else console.log("\nNo TeachOS user id on any record, so the manager table cannot be the source.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
