// One-off (2026-10-07): the 7 people marked inactive in TeachOS still show
// ACTIVE in niat_instructor_details (a view over a table we cannot read).
// Looks through EVERY table/view in our BigQuery dataset for a different
// source that already knows they are inactive: any table with an
// instructor_user_id (or nw_instructor_id) column plus a status/active-style
// column, then prints what each says about these 7. Read-only.
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const USER_IDS = [
  "d11989acc31d44e4b7b15ff982c8435e", "2e6538f5ed574ec3b383dfb1f8bf6462", "865dfe29803c48d49e3db230308166f1",
  "fc14baf3b3d4484ebec2ea811b23c92d", "c456cddf71254fbb8b3881bce07e749f", "ea3cd38b8f31493fbc0327822bc51256",
  "3328ebdbb68342f79f433b3e32f54e0d",
];
const NW_IDS = ["NW2000697", "NW0006883", "NW0001780", "NW2000678", "NW2000632", "NW2000680", "NW2000749"];
const STATUS_LIKE = /status|active|deactiv|disabled|enabled|archived|deleted|removed|left|resign/i;

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const dataset = bq.dataset(config.BIGQUERY_DATASET!);
  const [tables] = await dataset.getTables();
  console.log(`${tables.length} tables/views in ${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}\n`);
  for (const t of tables) {
    const id = t.id ?? "";
    let fields: Array<{ name: string; type: string }> = [];
    let modified = "?";
    try {
      const [m] = await t.getMetadata();
      fields = m.schema?.fields ?? [];
      modified = m.lastModifiedTime ? new Date(Number(m.lastModifiedTime)).toISOString() : "?";
    } catch { continue; }
    const names = fields.map((f) => f.name);
    const idCol = names.includes("instructor_user_id") ? "instructor_user_id" : names.includes("nw_instructor_id") ? "nw_instructor_id" : null;
    const statusCols = names.filter((n) => STATUS_LIKE.test(n));
    if (!idCol || statusCols.length === 0) continue;
    console.log(`== ${id} (lastModified ${modified}) | id column: ${idCol} | status-like columns: ${statusCols.join(", ")}`);
    try {
      const values = idCol === "instructor_user_id" ? USER_IDS : NW_IDS;
      const [rows] = await bq.query({
        query: `SELECT ${[idCol, ...statusCols].map((c) => `\`${c}\``).join(", ")} FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${id}\` WHERE \`${idCol}\` IN UNNEST(@v) LIMIT 50`,
        params: { v: values }, types: { v: ["STRING"] },
      });
      if (rows.length === 0) console.log("   (none of the 7 appear here)");
      for (const r of rows) console.log("   " + JSON.stringify(r));
    } catch (e) { console.log(`   query failed: ${(e as Error).message}`); }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
