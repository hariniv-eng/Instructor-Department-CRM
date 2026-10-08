// One-off (2026-10-07): why do 6 of the 7 Exception-2 people have no Capability
// Manager? Prints every raw instructor_manager candidate the BigQuery manager
// table holds for each of them, and whether it is on the valid roster
// (reconcileCapabilityManager only accepts roster names). Also prints the DB's
// teachosManager / manualCapabilityManager. Read-only.
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { db, instructorsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { normalize } from "../reconcile";
import { VALID_CAPABILITY_MANAGERS, CAPABILITY_MANAGER_ALIASES } from "../../data/validCapabilityManagers";

const USER_IDS = [
  "d11989acc31d44e4b7b15ff982c8435e", "2e6538f5ed574ec3b383dfb1f8bf6462", "865dfe29803c48d49e3db230308166f1",
  "fc14baf3b3d4484ebec2ea811b23c92d", "c456cddf71254fbb8b3881bce07e749f", "ea3cd38b8f31493fbc0327822bc51256",
  "3328ebdbb68342f79f433b3e32f54e0d",
];
const valid = new Set([...VALID_CAPABILITY_MANAGERS, ...Object.keys(CAPABILITY_MANAGER_ALIASES)].map(normalize));

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ref = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${process.env.CAPABILITY_MANAGER_TABLE || "niat_instructor_managers_and_instructors_details"}`;
  const people = await db.select().from(instructorsTable).where(inArray(instructorsTable.teachosUserId, USER_IDS));
  for (const uid of USER_IDS) {
    const p = people.find((x) => x.teachosUserId === uid);
    const [rows] = await bq.query({
      query: `SELECT instructor_manager, instructor_manager_category FROM \`${ref}\` WHERE instructor_user_id = @u`,
      params: { u: uid },
    });
    console.log(`\n${p?.fullName ?? "(not in DB)"} [${uid}] teachosManager=${p?.teachosManager ?? "null"} manual=${p?.manualCapabilityManager ?? "null"}`);
    if (rows.length === 0) console.log("   BigQuery manager table: NO rows for this user id");
    for (const r of rows) {
      const m = (r as any).instructor_manager as string | null;
      console.log(`   candidate: ${JSON.stringify(m)} -> ${m && valid.has(normalize(m)) ? "on roster" : "NOT on roster / empty"}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
