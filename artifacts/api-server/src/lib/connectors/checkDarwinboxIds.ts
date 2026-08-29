// One-off CLI: checks whether specific employee ids exist ANYWHERE in the
// Darwinbox Master API's raw response (regardless of department), to tell
// apart "excluded by our department filter" from "not in this API's
// configured dataset at all" (DARWINBOX_DATASET_KEY scope).
//
// Run: pnpm --filter @workspace/api-server run check:darwinbox-ids -- NW0004322 NW2000479 ...

import path from "node:path";
import { fileURLToPath } from "node:url";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
try {
  process.loadEnvFile(envPath);
} catch (e) {
  console.error(`Could not load ${envPath}:`, e instanceof Error ? e.message : e);
}

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: pnpm --filter @workspace/api-server run check:darwinbox-ids -- <employee_id> [more ids...]");
  process.exit(1);
}

import("./darwinbox")
  .then((m) => m.checkEmployeeIds(ids))
  .catch((e) => {
    console.error("Check failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
