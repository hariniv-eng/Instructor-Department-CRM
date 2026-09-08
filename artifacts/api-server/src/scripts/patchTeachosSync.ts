// Runs the EXACT same reconciliation the "Sync Now" button for TeachOS runs
// (fetchNiatInstructorDetailsRows -> reconcileTeachos -> Capability Manager
// enrichment (fetchCapabilityManagerRows -> reconcileCapabilityManager,
// same non-fatal try/catch as runTeachosSync()) -> recomputeStatuses) -- but
// from a script instead of an HTTP request, and prints a before/after check
// on the 15 employee IDs we've been tracking so you can see exactly what
// changed, plus the Capability Manager enrichment result (matched/unmatched
// counts, or the actual error if it fails).
//
// *** WHERE TO RUN THIS ***
// Run this from Replit's own Shell tab (inside your Repl), NOT from your
// local PowerShell. Here's why: DATABASE_URL for the LIVE/production
// database only resolves the way you want it to from inside Replit --
// Replit's deployment reads it from Replit Secrets, and your LOCAL .env has
// a *different*, local-only DATABASE_URL (see LIVE_SYNC.md's note on this).
// Running this script locally would touch a different database than the
// one your deployed app actually reads from -- it would look like it
// worked, but the live app wouldn't change at all. Replit's Shell already
// has the same Secrets (DATABASE_URL, BigQuery credentials) injected as env
// vars automatically, with nothing to copy or paste.
//
// To run it in Replit's Shell:
//   1. Copy this file to artifacts/api-server/src/scripts/patchTeachosSync.ts
//      in your Repl (via the Replit file editor, or `git pull` after
//      committing it -- either way).
//   2. In the Shell tab, cd into artifacts/api-server
//   3. Run: pnpm exec tsx src/scripts/patchTeachosSync.ts
//
// This is not a special one-off patch for these 15 people specifically --
// it's the real sync, so it re-reconciles EVERYONE against fresh BigQuery
// data (same as clicking "Sync Now" would). The before/after table below is
// just there to give you a clear, immediate answer on the 15 we've been
// watching.

import path from "node:path";
import { fileURLToPath } from "node:url";

// Same reasoning as export.ts: load .env by an explicit path (harmless if
// running in Replit, where these vars are already set by Secrets and this
// just becomes a no-op for anything already present in process.env), and
// only import the rest afterward so config.ts's module-evaluation-time
// reads see the right values.
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
try {
  process.loadEnvFile(envPath);
} catch {
  // Fine if this doesn't exist / isn't needed -- Replit Secrets already
  // populate process.env before this script runs there.
}

const TRACKED_EMPLOYEE_IDS = [
  "NW0007639", "NW0007638", "NW0007537", "NW0007577", "NW0007509",
  "NW0007534", "NW0007535", "NW0007613", "NW0007464", "NW0007637",
  "NW0007404", "NW0007533", "NW0007636", "NW0007611", "NW0007610",
];

type TrackedRow = { employeeId: string; fullName: string; inTeachos: boolean | null; teachosUserId: string | null; computedStatus: string | null; capabilityManager: string | null };

async function snapshot(db: any, instructorsTable: any, inArray: any): Promise<TrackedRow[]> {
  const rows: any[] = await db
    .select({
      employeeId: instructorsTable.employeeId,
      fullName: instructorsTable.fullName,
      inTeachos: instructorsTable.inTeachos,
      teachosUserId: instructorsTable.teachosUserId,
      computedStatus: instructorsTable.computedStatus,
      teachosManager: instructorsTable.teachosManager,
    })
    .from(instructorsTable)
    .where(inArray(instructorsTable.employeeId, TRACKED_EMPLOYEE_IDS));
  const byId: Record<string, any> = {};
  for (const r of rows) byId[r.employeeId as string] = r;
  return TRACKED_EMPLOYEE_IDS.map((id): TrackedRow => {
    const r = byId[id];
    if (!r) return { employeeId: id, fullName: "(not found)", inTeachos: null, teachosUserId: null, computedStatus: null, capabilityManager: null };
    return { employeeId: r.employeeId, fullName: r.fullName, inTeachos: r.inTeachos, teachosUserId: r.teachosUserId, computedStatus: r.computedStatus, capabilityManager: r.teachosManager };
  });
}

function printRow(r: TrackedRow) {
  console.log(`${r.employeeId} | ${r.fullName} | in_teachos=${r.inTeachos} | teachos_user_id=${r.teachosUserId} | status=${r.computedStatus} | capability_manager=${r.capabilityManager}`);
}

async function main() {
  const { db, instructorsTable } = await import("@workspace/db");
  const { inArray } = await import("drizzle-orm");
  const { fetchNiatInstructorDetailsRows } = await import("../lib/connectors/niatInstructorDetails");
  const { fetchCapabilityManagerRows } = await import("../lib/connectors/capabilityManager");
  const { reconcileTeachos, reconcileCapabilityManager, recomputeStatuses } = await import("../lib/reconcile");

  console.log("=== BEFORE ===");
  const before = await snapshot(db, instructorsTable, inArray);
  for (const r of before) printRow(r);

  console.log("\nFetching fresh niat_instructor_details from BigQuery...");
  const rows = await fetchNiatInstructorDetailsRows();
  console.log(`Fetched ${rows.length} rows. Reconciling (this updates the WHOLE instructors table, same as "Sync Now")...`);
  await reconcileTeachos(rows);
  console.log("Core TeachOS reconcile done.");

  // Same non-fatal try/catch shape as runTeachosSync() in routes/sync.ts --
  // a failure here must not stop recomputeStatuses() from still running.
  console.log("\nFetching Capability Manager rows from BigQuery (the older niat_instructor_managers_and_instructors_details table)...");
  try {
    const managerRows = await fetchCapabilityManagerRows();
    const result = await reconcileCapabilityManager(managerRows);
    console.log(`Capability Manager enrichment OK: matched=${result.matched} unmatched=${result.unmatched} invalid=${result.invalid} droppedLowPriority=${result.droppedLowPriority} total_rows=${result.total_rows}`);
  } catch (e) {
    console.error("Capability Manager enrichment FAILED (non-fatal, continuing):", e instanceof Error ? e.message : e);
  }

  await recomputeStatuses();
  console.log("Recompute done.");

  console.log("\n=== AFTER ===");
  const after = await snapshot(db, instructorsTable, inArray);
  for (const r of after) printRow(r);

  const resolvedCount = after.filter((r) => r.inTeachos === true).length;
  const capabilityCount = after.filter((r) => r.capabilityManager).length;
  console.log(`\n${resolvedCount} / ${TRACKED_EMPLOYEE_IDS.length} of the tracked 15 now show in_teachos=true.`);
  console.log(`${capabilityCount} / ${TRACKED_EMPLOYEE_IDS.length} of the tracked 15 now have a capability_manager value.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("patchTeachosSync failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
