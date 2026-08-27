// One-off CLI to see what a BigQuery column actually contains — distinct
// values and how many rows carry each. Useful before deciding whether a
// column like "availability_status" is actually usable as an instructor
// active/inactive signal.
//
// Run: pnpm --filter @workspace/api-server run check:teachos-column -- <column_name>
// e.g.: pnpm --filter @workspace/api-server run check:teachos-column -- availability_status

import path from "node:path";
import { fileURLToPath } from "node:url";

// Same reasoning as inspect.ts/export.ts: load .env by an explicit path,
// and only import the connector module (dynamically) afterward — config.ts
// builds its config object at module-evaluation time.
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
try {
  process.loadEnvFile(envPath);
} catch (e) {
  console.error(`Could not load ${envPath}:`, e instanceof Error ? e.message : e);
}

const column = process.argv[2];
if (!column) {
  console.error("Usage: pnpm --filter @workspace/api-server run check:teachos-column -- <column_name>");
  process.exit(1);
}

import("./bigquery")
  .then((m) => m.checkDistinctValues(column))
  .catch((e) => {
    console.error("Check failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
