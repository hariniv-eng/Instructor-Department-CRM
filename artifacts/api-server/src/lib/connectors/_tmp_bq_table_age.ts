// One-off (2026-10-07): BigQuery's niat_instructor_details still says ACTIVE for
// the 7 people marked inactive in TeachOS yesterday. Checks (1) when that table
// was last modified, (2) how many rows carry each instructor_status, (3) every
// column on the table (looking for an updated-at / deactivated field), and
// (4) the FULL rows for those 7 people. Read-only.
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const USER_IDS = [
  "d11989acc31d44e4b7b15ff982c8435e", "2e6538f5ed574ec3b383dfb1f8bf6462", "865dfe29803c48d49e3db230308166f1",
  "fc14baf3b3d4484ebec2ea811b23c92d", "c456cddf71254fbb8b3881bce07e749f", "ea3cd38b8f31493fbc0327822bc51256",
  "3328ebdbb68342f79f433b3e32f54e0d",
];

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const name = process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details";
  const table = bq.dataset(config.BIGQUERY_DATASET!).table(name);
  const [meta] = await table.getMetadata();
  console.log(`Table ${name}: lastModifiedTime=${meta.lastModifiedTime ? new Date(Number(meta.lastModifiedTime)).toISOString() : "?"} | numRows=${meta.numRows} | type=${meta.type}`);
  const cols = (meta.schema?.fields ?? []).map((f: { name: string; type: string }) => `${f.name}:${f.type}`);
  console.log(`Columns: ${cols.join(", ")}\n`);
  const ref = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${name}`;
  const [byStatus] = await bq.query({ query: `SELECT instructor_status, COUNT(*) AS n FROM \`${ref}\` GROUP BY instructor_status ORDER BY n DESC` });
  console.log("Rows by instructor_status:", JSON.stringify(byStatus));
  const [rows] = await bq.query({ query: `SELECT * FROM \`${ref}\` WHERE instructor_user_id IN UNNEST(@ids)`, params: { ids: USER_IDS }, types: { ids: ["STRING"] } });
  console.log(`\nFull rows for the 7 people (${rows.length}):`);
  for (const r of rows) console.log(JSON.stringify(r));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
