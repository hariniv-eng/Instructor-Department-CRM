import { Router, type IRouter } from "express";
import {
  db,
  uploadsTable,
  darwinboxActiveTable,
  darwinboxExitsTable,
  darwinboxFullRosterTable,
  teachosDeploymentTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";
import { config } from "../lib/connectors/config";
import { fetchDarwinRowsBoth, DarwinboxError } from "../lib/connectors/darwinbox";
import { fetchExitRows, DarwinboxExitsError } from "../lib/connectors/darwinboxExits";
import { fetchNiatInstructorDetailsRows, NiatInstructorDetailsError } from "../lib/connectors/niatInstructorDetails";
import { storeDarwinboxActive, storeDarwinboxExits, storeDarwinboxFullRoster, storeTeachosDeployment } from "../lib/storeRaw";
import { reconcileDarwin, reconcileDarwinFullRosterFallback, reconcileTeachos, reconcileTeachosEmployeeIdReference, recomputeStatuses } from "../lib/reconcile";
import { LAST_SYNC, type SyncResult } from "../lib/syncState";

const router: IRouter = Router();

// Each sync below pulls from the source, replaces that source's own raw
// table (see lib/storeRaw.ts), and then reconciles those same rows into the
// instructors table using the exact same matching logic manual CSV/XLSX
// uploads already use (lib/reconcile.ts) — so "Sync Now" and the background
// scheduler keep the instructor register (and the classification fields it
// carries — see recomputeStatuses()) current on their own, the same as a
// manual upload does, without anyone having to re-export and re-upload a
// file after every sync.
//
// The Darwinbox exits sync is the one exception: it does NOT call
// reconcileExits() (which hard-sets manualStatus="exited", removing someone
// from the active headcount entirely — the deliberate behavior manual
// "Exit List" uploads still use). A live exit-report sync should only ever
// *flag* a person for review, never auto-subtract them from the standing
// instructor count per the TeachOS instructor-count rule (see
// TEACHOS_INSTRUCTOR_COUNT_RULES.md and classificationOverrides.ts) — so it
// just refreshes darwinboxExitsTable and calls recomputeStatuses(), which
// already reads that table fresh on every run to set exitFlag/
// exitFlagStatus/exitFlagDate. Marking someone as actually, fully exited
// stays a deliberate manual action via the Exit List upload.

async function runDarwinboxSync(): Promise<SyncResult> {
  try {
    // One Master API round trip yields both the Instructors-department-
    // filtered rows (primary match, same as before) and Darwin's full
    // company roster (fallback match target for TeachOS instructors whose
    // Darwin record isn't filed under "Instructors" at all — see
    // reconcileDarwinFullRosterFallback() in lib/reconcile.ts).
    const { instructorRows, fullRosterRows } = await fetchDarwinRowsBoth();
    const stored = await storeDarwinboxActive(instructorRows);
    await storeDarwinboxFullRoster(fullRosterRows);
    await reconcileDarwin(instructorRows);
    await reconcileDarwinFullRosterFallback(fullRosterRows);
    await recomputeStatuses();
    await db.insert(uploadsTable).values({ source: "Darwin", filename: "Darwinbox API sync (raw + full roster + reconciled)", rowCount: stored });
    return { ok: true, source: "darwinbox_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof DarwinboxError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { ok: false, source: "darwinbox_live", error: message, synced_at: new Date().toISOString() };
  }
}

async function runDarwinboxExitsSync(): Promise<SyncResult> {
  try {
    const rows = await fetchExitRows();
    const stored = await storeDarwinboxExits(rows);
    await recomputeStatuses(); // re-derives exit flags for existing instructors from the freshly replaced raw exits table — see comment above
    await db.insert(uploadsTable).values({ source: "Exit List", filename: "Darwinbox reports-API sync (raw, flagged only)", rowCount: stored });
    return { ok: true, source: "darwinbox_exits_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof DarwinboxExitsError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { ok: false, source: "darwinbox_exits_live", error: message, synced_at: new Date().toISOString() };
  }
}

async function runTeachosSync(): Promise<SyncResult> {
  try {
    // Switched from fetchTeachosRows() (bigquery.ts, table
    // niat_instructor_managers_and_instructors_details) to
    // fetchNiatInstructorDetailsRows() (niatInstructorDetails.ts, table
    // niat_instructor_details) — the latter carries employee_id inline on
    // every row, which reconcileTeachos() now reads directly and matches on
    // first (see the rowEmployeeId handling there), instead of relying on
    // fragile full-name string matching that produced duplicate
    // "needs_review" records for anyone whose TeachOS/Darwin name spellings
    // didn't line up exactly. Tradeoff: niat_instructor_details has no
    // instructor_manager / instructor_manager_mail columns, so
    // teachosManager goes unset via this path for now.
    const rows = await fetchNiatInstructorDetailsRows();
    const stored = await storeTeachosDeployment(rows);
    await reconcileTeachos(rows);
    await recomputeStatuses();
    await db.insert(uploadsTable).values({ source: "TeachOS", filename: "BigQuery sync (niat_instructor_details, raw + reconciled)", rowCount: stored });
    return { ok: true, source: "teachos_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof NiatInstructorDetailsError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { ok: false, source: "teachos_live", error: message, synced_at: new Date().toISOString() };
  }
}

async function runNiatInstructorDetailsSync(): Promise<SyncResult> {
  try {
    const rows = await fetchNiatInstructorDetailsRows();
    const result = await reconcileTeachosEmployeeIdReference(rows);
    await recomputeStatuses();
    await db.insert(uploadsTable).values({ source: "NIAT Instructor Details", filename: "BigQuery sync (employee ID mapping)", rowCount: rows.length });
    console.log(`niat_instructor_details sync: matched=${result.matched} unmatched=${result.unmatched} conflicts=${result.conflicts} total_rows=${result.total_rows}`);
    return { ok: true, source: "niat_instructor_details_live", stored: rows.length, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof NiatInstructorDetailsError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { ok: false, source: "niat_instructor_details_live", error: message, synced_at: new Date().toISOString() };
  }
}

router.post("/sync/niat-instructor-details", async (_req, res) => {
  const result = await runNiatInstructorDetailsSync();
  LAST_SYNC.niat_instructor_details_live = result;
  res.json(result);
});

router.get("/sync/niat-instructor-details/data", async (_req, res) => {
  try {
    const rows = await fetchNiatInstructorDetailsRows();
    res.json({ count: rows.length, rows });
  } catch (e) {
    const message = e instanceof NiatInstructorDetailsError ? e.message : `Unexpected error: ${(e as Error).message}`;
    res.status(500).json({ ok: false, error: message });
  }
});

router.post("/sync/darwinbox", async (_req, res) => {
  const result = await runDarwinboxSync();
  LAST_SYNC.darwinbox_live = result;
  res.json(result);
});

router.post("/sync/darwinbox-exits", async (_req, res) => {
  const result = await runDarwinboxExitsSync();
  LAST_SYNC.darwinbox_exits_live = result;
  res.json(result);
});

router.post("/sync/teachos", async (_req, res) => {
  const result = await runTeachosSync();
  LAST_SYNC.teachos_live = result;
  res.json(result);
});

router.get("/sync/status", (_req, res) => {
  res.json({
    darwinbox: { auto_sync_interval_hours: config.DARWINBOX_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.darwinbox_live },
    darwinbox_exits: { auto_sync_interval_hours: config.DARWINBOX_EXITS_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.darwinbox_exits_live },
    teachos: { auto_sync_interval_hours: config.BIGQUERY_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.teachos_live },
    niat_instructor_details: { auto_sync_interval_hours: 0, last_sync: LAST_SYNC.niat_instructor_details_live },
  });
});

// Plain read-only views of each source's current raw snapshot — not part of
// the OpenAPI spec yet (no typed frontend hooks), just for verifying via
// curl/Invoke-WebRequest that a sync actually stored what you expect. These
// can get wired into the OpenAPI spec + frontend once needed.
router.get("/sync/darwinbox/data", async (_req, res) => {
  const rows = await db.select().from(darwinboxActiveTable).orderBy(desc(darwinboxActiveTable.id));
  res.json({ count: rows.length, rows });
});

router.get("/sync/darwinbox-exits/data", async (_req, res) => {
  const rows = await db.select().from(darwinboxExitsTable).orderBy(desc(darwinboxExitsTable.id));
  res.json({ count: rows.length, rows });
});

router.get("/sync/teachos/data", async (_req, res) => {
  const rows = await db.select().from(teachosDeploymentTable).orderBy(desc(teachosDeploymentTable.id));
  res.json({ count: rows.length, rows });
});

router.get("/sync/darwinbox-full-roster/data", async (_req, res) => {
  const rows = await db.select().from(darwinboxFullRosterTable).orderBy(desc(darwinboxFullRosterTable.id));
  res.json({ count: rows.length, rows });
});

export { runDarwinboxSync, runDarwinboxExitsSync, runTeachosSync };
export default router;
