// One-off (2026-10-07): is niat_instructor_managers_and_instructors_details a
// full instructor roster or only people with a manager? Compares it with
// niat_instructor_details, and searches it for the 7 Exception-2 people by
// user id AND employee id anywhere in the row. Read-only.
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const USER_IDS = [
  "d11989acc31d44e4b7b15ff982c8435e", "2e6538f5ed574ec3b383dfb1f8bf6462", "865dfe29803c48d49e3db230308166f1",
  "fc14baf3b3d4484ebec2ea811b23c92d", "c456cddf71254fbb8b3881bce07e749f", "ea3cd38b8f31493fbc0327822bc51256",
  "3328ebdbb68342f79f433b3e32f54e0d",
];
const NW_IDS = ["NW2000697", "NW0006883", "NW0001780", "NW2000678", "NW2000632", "NW2000680", "NW2000749"];

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const base = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const D = `\`${base}.niat_instructor_details\``;
  const M = `\`${base}.niat_instructor_managers_and_instructors_details\``;
  const q = async (query: string, params?: Record<string, unknown>, types?: Record<string, unknown>) =>
    (await bq.query({ query, params, types } as any))[0] as Array<Record<string, unknown>>;

  for (const [label, t] of [["details", "niat_instructor_details"], ["managers", "niat_instructor_managers_and_instructors_details"]]) {
    const [m] = await bq.dataset(config.BIGQUERY_DATASET!).table(t).getMetadata();
    console.log(`${label} columns: ${(m.schema?.fields ?? []).map((f: any) => f.name).join(", ")}`);
  }

  console.log("\n-- coverage --");
  console.log("details  :", JSON.stringify((await q(`SELECT COUNT(*) AS rows_, COUNT(DISTINCT instructor_user_id) AS users FROM ${D}`))[0]));
  console.log("managers :", JSON.stringify((await q(`SELECT COUNT(*) AS rows_, COUNT(DISTINCT instructor_user_id) AS users, COUNT(DISTINCT IF(instructor_manager IS NOT NULL AND instructor_manager != '', instructor_user_id, NULL)) AS users_with_manager FROM ${M}`))[0]));
  console.log("details users with NO row in managers:", JSON.stringify((await q(`SELECT COUNT(DISTINCT d.instructor_user_id) AS n FROM ${D} d LEFT JOIN ${M} m ON m.instructor_user_id = d.instructor_user_id WHERE m.instructor_user_id IS NULL`))[0]));
  console.log("managers users with NO row in details:", JSON.stringify((await q(`SELECT COUNT(DISTINCT m.instructor_user_id) AS n FROM ${M} m LEFT JOIN ${D} d ON d.instructor_user_id = m.instructor_user_id WHERE d.instructor_user_id IS NULL`))[0]));

  console.log("\n-- the 7 people: any trace in the managers table (any column, user id or employee id)? --");
  const hits = await q(
    `SELECT TO_JSON_STRING(m) AS j FROM ${M} m WHERE EXISTS (SELECT 1 FROM UNNEST(@ids) i WHERE STRPOS(TO_JSON_STRING(m), i) > 0) LIMIT 40`,
    { ids: [...USER_IDS, ...NW_IDS] }, { ids: ["STRING"] });
  console.log(hits.length === 0 ? "none" : hits.map((h) => h.j).join("\n"));

  console.log("\n-- their rows in niat_instructor_details --");
  const det = await q(`SELECT TO_JSON_STRING(d) AS j FROM ${D} d WHERE d.instructor_user_id IN UNNEST(@ids)`, { ids: USER_IDS }, { ids: ["STRING"] });
  for (const r of det) console.log(r.j);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
