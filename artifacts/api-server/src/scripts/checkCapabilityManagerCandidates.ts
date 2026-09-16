// One-off CLI to see every distinct instructor_manager value actually
// present in the raw Capability Manager source table (capabilityManager.ts's
// niat_instructor_managers_and_instructors_details, via
// fetchCapabilityManagerRows() -- respects CAPABILITY_MANAGER_TABLE the same
// way that connector does), with a row count for each.
//
// Why this exists instead of just grepping the export:teachos CSV: that
// export is built by mapping over niatInstructorDetails.ts's ACTIVE rows and
// attaching whatever manager candidates match their instructor_user_id --
// so a manager who's only ever assigned (in the raw table) to someone who
// ISN'T also an ACTIVE row in niat_instructor_details silently never shows
// up in that export at all. This script queries the manager table directly,
// with no such join/filter, so it answers "does this name appear ANYWHERE
// in the raw data" definitively (2026-09-16, per request -- checking why
// Riya Rai / Pradeep Jat weren't appearing as anyone's Capability Manager
// in the app).
//
// Also note: bigquery.ts's own check:teachos-column script can't be used for
// this anymore -- BIGQUERY_TABLE now points at niat_instructor_details (the
// identity table, no manager column at all), not the manager-roster table
// bigquery.ts's header comment describes. That env var got repointed when
// the live sync switched over; nothing here relies on it.
//
// Run: pnpm --filter @workspace/api-server run check:capability-managers
// Optionally filter to names containing a search string:
//   pnpm --filter @workspace/api-server run check:capability-managers riya

import path from "node:path";
import { fileURLToPath } from "node:url";

// Same reasoning as patchTeachosSync.ts: load .env by an explicit path
// (harmless no-op in Replit, where Secrets already populate process.env),
// and only import the connector module (dynamically) afterward, since
// config.ts builds its config object at module-evaluation time.
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
try {
  process.loadEnvFile(envPath);
} catch {
  // Fine if this doesn't exist -- Replit Secrets already populate
  // process.env before this script runs there.
}

const search = process.argv[2]?.toLowerCase();

import("../lib/connectors/capabilityManager")
  .then(async (m) => {
    const rows = await m.fetchCapabilityManagerRows();
    const counts = new Map<string, number>();
    for (const row of rows) {
      const manager = row["instructor_manager"] as string | null;
      if (!manager) continue;
      counts.set(manager, (counts.get(manager) ?? 0) + 1);
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const filtered = search ? entries.filter(([name]) => name.toLowerCase().includes(search)) : entries;
    console.log(`${rows.length} total instructor_manager rows, ${counts.size} distinct names.`);
    if (search) console.log(`Filtered to names containing "${search}":`);
    for (const [name, count] of filtered) {
      console.log(`  ${JSON.stringify(name)} — ${count} row(s)`);
    }
    if (search && filtered.length === 0) console.log("  (no matches)");
  })
  .catch((e) => {
    console.error("Check failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
