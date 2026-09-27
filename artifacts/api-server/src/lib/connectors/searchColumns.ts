// CLI entry point for searchDatasetColumns.ts's searchColumns() -- searches
// every table in the configured BigQuery dataset (and every other dataset
// in the same project) for a column whose name CONTAINS the given search
// term, case-insensitively. Use a short partial term (e.g. "enrol") rather
// than guessing a full exact name -- this is meant to replace repeatedly
// guessing spellings against check:niat-instructor-details-column/
// check:teachos-column one at a time.
//
// Run: pnpm --filter @workspace/api-server run search:bigquery-columns -- <partial_term>
// e.g.: pnpm --filter @workspace/api-server run search:bigquery-columns -- enrol

import path from "node:path";
import { fileURLToPath } from "node:url";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
try {
  process.loadEnvFile(envPath);
} catch (e) {
  console.error(`Could not load ${envPath}:`, e instanceof Error ? e.message : e);
}

// Same "--" forwarding quirk as checkColumnValues.ts/checkNiatInstructorDetailsColumn.ts.
const term = process.argv.slice(2).find((arg) => arg !== "--");
if (!term) {
  console.error("Usage: pnpm --filter @workspace/api-server run search:bigquery-columns -- <partial_term>");
  process.exit(1);
}

import("./searchDatasetColumns")
  .then((m) => m.searchColumns(term))
  .catch((e) => {
    console.error("Search failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
