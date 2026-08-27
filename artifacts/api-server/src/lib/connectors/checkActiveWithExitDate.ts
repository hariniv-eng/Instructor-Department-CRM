// One-off/rerunnable check: Instructors-department employees whose
// Darwinbox record says employee_status is "Active" but also has a
// date_of_exit value set — a data-quality flag worth a human look, not
// something the sync logic should silently paper over.
//
// Run: pnpm --filter @workspace/api-server run check:active-with-exit-date
//
// Console output only — no CSV written. (darwinbox.csv, from
// `export:darwinbox`, already carries Date Of Exit as a regular column for
// every record; this is just a quick filtered look, not a separate file.)

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

import("./darwinbox")
  .then(async (m) => {
    const records = await m.fetchEmployeeRecords(); // already filtered to Instructors department
    const flagged = records.filter((rec) => {
      const status = String(rec["employee_status"] ?? "").trim().toLowerCase();
      const exitDate = String(rec["date_of_exit"] ?? "").trim();
      return status === "active" && exitDate !== "";
    });

    console.log(`Checked ${records.length} Instructors-department records.`);
    console.log(`Found ${flagged.length} marked "Active" with a date_of_exit set:`);
    for (const rec of flagged) {
      console.log(`  ${rec["full_name"]} (${rec["employee_id"]}) — exit date: ${rec["date_of_exit"]}, dept: ${rec["department"]}`);
    }
  })
  .catch((e) => {
    console.error("Check failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
