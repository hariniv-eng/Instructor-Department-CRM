// One-off CLI to see what a column on niat_instructor_details actually
// contains — distinct values and how many rows carry each. Same idea as
// checkColumnValues.ts, just pointed at this table instead of the
// niat_instructor_managers_and_instructors_details one bigquery.ts reads —
// niat_instructor_details is a separate table (see niatInstructorDetails.ts's
// header comment), so a new column showing up there (2026-09-27, per
// request: "column name = enroleplan") needs this connector's own
// checkDistinctValues(), not bigquery.ts's.
//
// Run: pnpm --filter @workspace/api-server run check:niat-instructor-details-column -- <column_name>
// e.g.: pnpm --filter @workspace/api-server run check:niat-instructor-details-column -- enroleplan

import path from "node:path";
import { fileURLToPath } from "node:url";

// Same reasoning as inspect.ts/export.ts/checkColumnValues.ts: load .env by
// an explicit path, and only import the connector module (dynamically)
// afterward — config.ts builds its config object at module-evaluation time.
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
try {
  process.loadEnvFile(envPath);
} catch (e) {
  console.error(`Could not load ${envPath}:`, e instanceof Error ? e.message : e);
}

const column = process.argv[2];
if (!column) {
  console.error("Usage: pnpm --filter @workspace/api-server run check:niat-instructor-details-column -- <column_name>");
  process.exit(1);
}

import("./niatInstructorDetails")
  .then((m) => m.checkDistinctValues(column))
  .catch((e) => {
    console.error("Check failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
