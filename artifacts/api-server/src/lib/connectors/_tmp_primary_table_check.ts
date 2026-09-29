import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"));
} catch {
  // ignore
}

async function main() {
  const { config } = await import("./config");
  const { BigQuery } = await import("@google-cloud/bigquery");

  let credentials: Record<string, unknown> | undefined;
  if (config.BIGQUERY_CREDENTIALS_JSON) {
    credentials = JSON.parse(config.BIGQUERY_CREDENTIALS_JSON);
  }
  const bq = credentials
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });

  const table = process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details";
  const ref = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${table}`;

  console.log(`Querying PRIMARY table directly (no join): ${ref}`);

  const [rows] = await bq.query({
    query: `SELECT instructor_user_id, nw_instructor_id, instructor_name, instructor_status, instructor_category, instructor_role, institute_name, institute_type FROM \`${ref}\` WHERE LOWER(instructor_name) LIKE '%mani teja%'`,
  });

  console.log(`Rows found: ${rows.length}`);
  for (const r of rows) {
    console.log(JSON.stringify(r, null, 2));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
