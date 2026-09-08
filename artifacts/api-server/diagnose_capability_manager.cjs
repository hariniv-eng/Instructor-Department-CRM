// Diagnostic for why Capability Manager is coming back empty on the live
// app. Run this FROM artifacts/api-server (same folder as .env and
// bigquery-service-account.json) using Node's built-in .env loader:
//
//   node --env-file=.env diagnose_capability_manager.cjs
//
// It runs the EXACT same BigQuery query capabilityManager.ts runs against
// the older niat_instructor_managers_and_instructors_details table, using
// your own local credentials (same ones export:teachos used successfully
// before) -- so if this fails, it tells us directly what's wrong: bad
// table name, no access, wrong project/dataset, etc. If it succeeds, it
// also cross-checks whether any of the instructor_user_id values it
// returns actually match real teachos_user_id values from the live app,
// which is the other way this enrichment could be silently matching zero
// people even though the query itself works fine.

const { BigQuery } = require("@google-cloud/bigquery");

const LIVE_APP_URL = "https://instructor-department-crm-instructorcentr.replit.app";

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID;
const DATASET = process.env.BIGQUERY_DATASET;
const TABLE_NAME = process.env.CAPABILITY_MANAGER_TABLE || "niat_instructor_managers_and_instructors_details";

async function main() {
  console.log("Config being used:");
  console.log(`  BIGQUERY_PROJECT_ID = ${PROJECT_ID || "(missing!)"}`);
  console.log(`  BIGQUERY_DATASET    = ${DATASET || "(missing!)"}`);
  console.log(`  TABLE_NAME          = ${TABLE_NAME}`);
  console.log(`  GOOGLE_APPLICATION_CREDENTIALS = ${process.env.GOOGLE_APPLICATION_CREDENTIALS || "(missing!)"}`);

  if (!PROJECT_ID || !DATASET) {
    console.error("\nBIGQUERY_PROJECT_ID or BIGQUERY_DATASET is missing from .env -- stopping here.");
    process.exit(1);
  }

  const ref = `${PROJECT_ID}.${DATASET}.${TABLE_NAME}`;
  const bq = new BigQuery({ projectId: PROJECT_ID });

  console.log(`\n--- Step 1: does ${ref} exist and is it reachable? ---`);
  try {
    const [rows] = await bq.query({ query: `SELECT COUNT(*) AS cnt FROM \`${ref}\`` });
    console.log(`OK -- table exists and is queryable. Total row count: ${rows[0].cnt}`);
  } catch (e) {
    console.error("FAILED to query the table. This is almost certainly the root cause. Full error:");
    console.error(e.message || e);
    process.exit(1);
  }

  console.log(`\n--- Step 2: running the exact query capabilityManager.ts runs ---`);
  const query = `SELECT DISTINCT instructor_user_id AS instructor_user_id, instructor_manager AS instructor_manager FROM \`${ref}\` WHERE instructor_manager IS NOT NULL AND instructor_manager != ''`;
  let capRows;
  try {
    [capRows] = await bq.query({ query });
    console.log(`OK -- query succeeded. Rows with a non-empty manager: ${capRows.length}`);
    console.log("Sample of 5:");
    capRows.slice(0, 5).forEach((r) => console.log(JSON.stringify(r)));
  } catch (e) {
    console.error("FAILED running the filtered query (columns instructor_user_id / instructor_manager may not exist under those exact names). Full error:");
    console.error(e.message || e);
    process.exit(1);
  }

  console.log(`\n--- Step 3: do these instructor_user_id values match real teachos_user_id values from the live app? ---`);
  const capIds = new Set(capRows.map((r) => r.instructor_user_id));
  const res = await fetch(`${LIVE_APP_URL}/api/reports/instructors`);
  const data = await res.json();
  const people = (data.instructors || []).filter((p) => p.teachos_user_id);
  console.log(`Live app has ${people.length} people with a teachos_user_id.`);
  const matched = people.filter((p) => capIds.has(p.teachos_user_id));
  console.log(`Of those, ${matched.length} have an instructor_user_id that appears in the BigQuery capability-manager table.`);
  if (matched.length === 0 && people.length > 0 && capIds.size > 0) {
    console.log("\n>>> ZERO overlap between the two ID sets. This means the join key itself doesn't match --");
    console.log(">>> the enrichment query works, but nobody gets matched, so capability_manager stays null for everyone.");
    console.log("Sample teachos_user_id from the live app:", people.slice(0, 3).map((p) => p.teachos_user_id));
    console.log("Sample instructor_user_id from BigQuery:", [...capIds].slice(0, 3));
  } else if (matched.length > 0) {
    console.log("\n>>> There IS overlap -- the join key works for at least some people.");
    console.log("Matched example:", JSON.stringify(matched[0]));
  }
}

main().catch((e) => {
  console.error("Script crashed:", e);
  process.exit(1);
});
