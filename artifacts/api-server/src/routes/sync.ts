import { Router, type IRouter } from "express";
import {
  db,
  uploadsTable,
  darwinboxActiveTable,
  darwinboxExitsTable,
  darwinboxFullRosterTable,
  teachosDeploymentTable,
  instructorsTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";
import { fetchDarwinRowsBoth, DarwinboxError } from "../lib/connectors/darwinbox";
import { fetchExitRows, DarwinboxExitsError, getBaseReportGeneratedAt } from "../lib/connectors/darwinboxExits";
import { fetchNiatInstructorDetailsRows, NiatInstructorDetailsError } from "../lib/connectors/niatInstructorDetails";
import { fetchCapabilityManagerRows } from "../lib/connectors/capabilityManager";
import { fetchCourseStatusRows, InstructorLearningStatusError } from "../lib/connectors/instructorLearningStatus";
import { fetchContributionRows, fetchContributionDailyRows, InstructorContributionError } from "../lib/connectors/instructorContribution";
import { fetchEvaluationDailyRows } from "../lib/connectors/instructorEvaluations";
import { fetchTimeSpentDailyRows } from "../lib/connectors/instructorTimeSpent";
import { fetchTaughtCourseRows } from "../lib/connectors/taughtTraining";
import { fetchDemoCourseRows } from "../lib/connectors/demoTraining";
import { normalizeSubjectArea } from "../lib/departmentTaxonomy";
import { snapshotTeachosDataIntoArchive } from "../lib/archiveInstructors";
import { resolvedCourseDefs } from "../data/trainingCourseTaxonomy";
import { storeDarwinboxActive, storeDarwinboxExits, storeDarwinboxFullRoster, storeTeachosDeployment, storeTrainingStatus, storeTaughtCourses, storeDemoCourses, storeContribution, storeContributionDaily, storeEvaluationDaily, storeTimeSpentDaily } from "../lib/storeRaw";
import { reconcileDarwin, reconcileDarwinFullRosterFallback, reconcileTeachos, reconcileTeachosEmployeeIdReference, reconcileCapabilityManager, recomputeStatuses } from "../lib/reconcile";
import { sdb, inSyncTransaction, inSavepoint, withSyncLock } from "../lib/syncContext";
import { LAST_SYNC, LAST_CAPABILITY_MANAGER_SYNC, setLastCapabilityManagerSync, DAILY_AUTO_SYNC_INTERVAL_HOURS, type SyncResult } from "../lib/syncState";

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

// Drizzle wraps a failed insert/update/delete as a DrizzleQueryError whose
// own .message is just "Failed query: <sql>\nparams: <params>" -- useful for
// reproducing the query, useless for knowing WHY it failed. The actual
// driver/Postgres error (missing column, malformed array literal, value too
// long, etc.) is attached as `.cause` and gets silently dropped if we just
// read e.message like the sync handlers below used to. This pulls that real
// reason back out and appends it, and caps the (potentially huge, once a
// batch insert's full param list is included) base message so the Sync Now
// UI stays readable instead of dumping thousands of params into a toast.
function describeUnexpectedError(e: unknown): string {
  const err = e as (Error & { cause?: unknown }) | undefined;
  // Always log the raw error (with stack + cause) server-side too, so a
  // Replit log check can confirm the full picture even if the UI message
  // above ends up truncated or the cause turns out not to be an Error.
  console.error("[sync] unexpected error:", err);
  const base = err?.message ?? String(e);
  const truncatedBase = base.length > 500 ? `${base.slice(0, 500)}… (truncated)` : base;
  const cause = err?.cause instanceof Error ? err.cause.message : undefined;
  return cause ? `Unexpected error: ${truncatedBase} | cause: ${cause}` : `Unexpected error: ${truncatedBase}`;
}

async function runDarwinboxSync(): Promise<SyncResult> {
  try {
    // One Master API round trip yields both the Instructors-department-
    // filtered rows (primary match, same as before) and Darwin's full
    // company roster (fallback match target for TeachOS instructors whose
    // Darwin record isn't filed under "Instructors" at all — see
    // reconcileDarwinFullRosterFallback() in lib/reconcile.ts).
    const { instructorRows, fullRosterRows } = await fetchDarwinRowsBoth();
    // Store + reconcile + record happen in ONE transaction (see
    // lib/syncContext.ts): other requests keep seeing the previous complete
    // data until this commits, instead of a half-rebuilt table.
    const stored = await inSyncTransaction(async () => {
      const n = await storeDarwinboxActive(instructorRows);
      await storeDarwinboxFullRoster(fullRosterRows);
      await reconcileDarwin(instructorRows);
      await reconcileDarwinFullRosterFallback(fullRosterRows);
      await recomputeStatuses({ grantTeachosOnlyScope: true });
      await sdb.insert(uploadsTable).values({ source: "Darwin", filename: "Darwinbox API sync (raw + full roster + reconciled)", rowCount: n });
      return n;
    });
    return { ok: true, source: "darwinbox_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof DarwinboxError ? e.message : describeUnexpectedError(e);
    return { ok: false, source: "darwinbox_live", error: message, synced_at: new Date().toISOString() };
  }
}

async function runDarwinboxExitsSync(): Promise<SyncResult> {
  try {
    const rows = await fetchExitRows();
    // Never lose an exit record (2026-10-14, per request: payroll-converted instructors' exit records were disappearing). The exits
    // table is replaced on every sync, so anyone Darwin's reports stop returning -- a timed-out fallback report, a converted
    // employee whose Darwin record was removed -- used to vanish, and the next status recompute then wiped their exit flag and
    // auto-marked them Payroll Converted. Now every stored exit row whose employee id is absent from this pull is carried over
    // unchanged. People who ARE in the pull use Darwin's fresh rows as before.
    let keptRows = 0;
    {
      const have = new Set(rows.map((r) => String(r["Employee Id"] ?? "").trim().toLowerCase()).filter(Boolean));
      const previous = await db.select().from(darwinboxExitsTable);
      const keptPeople = new Set<string>();
      for (const prev of previous) {
        const raw = { ...((prev.rawData ?? {}) as Record<string, unknown>) };
        const id = String(prev.employeeId ?? raw["Employee Id"] ?? "").trim().toLowerCase();
        if (!id || have.has(id)) continue;
        if (!raw["Exit Source"]) raw["Exit Source"] = "Kept from an earlier sync (no longer returned by the Darwin reports)";
        rows.push(raw as (typeof rows)[number]);
        keptPeople.add(id);
        keptRows += 1;
      }
      if (keptRows) console.warn(`[sync] Kept ${keptRows} stored exit row(s) for ${keptPeople.size} employee(s) the Darwin reports did not return this run.`);
    }
    const stored = await inSyncTransaction(async () => {
      const n = await storeDarwinboxExits(rows);
      await recomputeStatuses(); // re-derives exit flags for existing instructors from the freshly replaced raw exits table — see comment above
      // The details after the name feed GET /sync/health (base report age, how many people came from the fallback / were kept).
      const fallbackAdded = rows.filter((r) => String(r["Exit Source"] ?? "").startsWith("Offboarding tracking")).length;
      const detail = ` [base report generated ${getBaseReportGeneratedAt() ?? "unknown"}; fallback +${fallbackAdded}; kept ${keptRows}]`;
      await sdb.insert(uploadsTable).values({ source: "Exit List", filename: `Darwinbox reports-API sync (raw, flagged only)${detail}`, rowCount: n });
      return n;
    });
    return { ok: true, source: "darwinbox_exits_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof DarwinboxExitsError ? e.message : describeUnexpectedError(e);
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
    // teachosManager goes unset via this path alone -- see the
    // reconcileCapabilityManager() call below, which patches it back on
    // from the older table as a second, non-fatal step.
    const rows = await fetchNiatInstructorDetailsRows();
    // The Capability Manager query is a network call, so it is fetched BEFORE
    // the transaction opens (a transaction should not sit open on a slow
    // BigQuery round trip). Still non-fatal, same as before.
    let managerRows: Awaited<ReturnType<typeof fetchCapabilityManagerRows>> | null = null;
    let managerFetchError: string | null = null;
    try {
      managerRows = await fetchCapabilityManagerRows();
    } catch (e) {
      managerFetchError = e instanceof Error ? e.message : String(e);
    }

    const stored = await inSyncTransaction(async () => {
      const n = await storeTeachosDeployment(rows);
      await reconcileTeachos(rows);

      // Capability Manager enrichment (2026-09-07, per request): patched onto
      // the rows just matched above via teachos_user_id (see
      // reconcileCapabilityManager()). Deliberately non-fatal -- run in a
      // savepoint (nested transaction) so a failure here rolls back only this
      // step and cannot poison the surrounding transaction.
      if (managerRows) {
        try {
          const result = await inSavepoint(async () => reconcileCapabilityManager(managerRows!));
          setLastCapabilityManagerSync({ ok: true, ...result, synced_at: new Date().toISOString() });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("Capability Manager enrichment failed (non-fatal):", message);
          setLastCapabilityManagerSync({ ok: false, error: message, synced_at: new Date().toISOString() });
        }
      } else {
        console.error("Capability Manager enrichment failed (non-fatal):", managerFetchError);
        setLastCapabilityManagerSync({ ok: false, error: managerFetchError ?? "unknown error", synced_at: new Date().toISOString() });
      }

      await recomputeStatuses();
      await sdb.insert(uploadsTable).values({ source: "TeachOS", filename: "BigQuery sync (niat_instructor_details, raw + reconciled)", rowCount: n });
      return n;
    });
    return { ok: true, source: "teachos_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof NiatInstructorDetailsError ? e.message : describeUnexpectedError(e);
    return { ok: false, source: "teachos_live", error: message, synced_at: new Date().toISOString() };
  }
}

async function runNiatInstructorDetailsSync(): Promise<SyncResult> {
  try {
    const rows = await fetchNiatInstructorDetailsRows();
    const result = await inSyncTransaction(async () => {
      const r = await reconcileTeachosEmployeeIdReference(rows);
      await recomputeStatuses();
      await sdb.insert(uploadsTable).values({ source: "NIAT Instructor Details", filename: "BigQuery sync (employee ID mapping)", rowCount: rows.length });
      return r;
    });
    console.log(`niat_instructor_details sync: matched=${result.matched} unmatched=${result.unmatched} conflicts=${result.conflicts} total_rows=${result.total_rows}`);
    return { ok: true, source: "niat_instructor_details_live", stored: rows.length, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof NiatInstructorDetailsError ? e.message : describeUnexpectedError(e);
    return { ok: false, source: "niat_instructor_details_live", error: message, synced_at: new Date().toISOString() };
  }
}

// Instructor Training Status (2026-09-23): aggregates
// niat_instructor_unit_wise_completion_and_best_attempt_details server-side
// (see fetchCourseStatusRows()) against the fixed course taxonomy in
// data/trainingCourseTaxonomy.ts, and fully replaces
// instructorTrainingStatusTable. Deliberately NOT wired into the scheduler
// or the main TeachOS sync above yet -- this is a brand-new feature built
// against real data confirmed only via one-off inspect/check CLI runs, not
// verified end-to-end through an actual sync yet, so it stays manual-only
// (triggered here) until confirmed working -- same caution as
// niat-instructor-details above (auto_sync_interval_hours: 0 in
// /sync/status). No reconcile step is needed: rows are stored keyed by the
// BigQuery instructor_user_id as-is; GET /reports/training-stats joins them
// against instructorsTable.teachosUserId at read time (same key
// reconcileCapabilityManager() already relies on), so there's nothing to
// match ahead of time the way Darwin/TeachOS name-matching needs.
async function runTrainingStatusSync(): Promise<SyncResult> {
  try {
    const rows = await fetchCourseStatusRows(resolvedCourseDefs());
    const stored = await storeTrainingStatus(rows);
    // Keep the Instructor Archive's copy of the training data current (2026-10-13).
    await snapshotTeachosDataIntoArchive().catch((e) => console.error("[archive] training snapshot failed:", e));
    await db.insert(uploadsTable).values({ source: "Instructor Training Status", filename: "BigQuery sync (niat_instructor_unit_wise_completion_and_best_attempt_details, aggregated per course)", rowCount: stored });
    // "Taught in class" training (2026-10-19): built right after, from the session view + the same training table. Its own try, so a
    // failure here never fails the learning-portal Training Status sync above.
    try {
      const taught = await storeTaughtCourses(await fetchTaughtCourseRows());
      await db.insert(uploadsTable).values({ source: "Instructor Taught Training", filename: "BigQuery sync (NIAT session ids completed vs course curriculum, per instructor + course)", rowCount: taught });
    } catch (e) {
      console.error("[taught-training] sync failed:", e);
      // Record the failure where it can be seen (2026-10-23): the uploads log, so _tmp_taught_totals.ts / Sync health show the reason.
      await db.insert(uploadsTable).values({ source: "Instructor Taught Training FAILED", filename: `taught-in-class step failed: ${String((e as Error)?.message ?? e).slice(0, 900)}`, rowCount: 0 }).catch(() => {});
    }
    // "Demos" view (2026-10-28): DEMO evaluations per instructor + lecture-list course, built right after. Its own try as well.
    try {
      const people = await db.select().from(instructorsTable);
      const subjectByUid = new Map(people.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, (normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) as string | null) ?? null]));
      const demos = await storeDemoCourses(await fetchDemoCourseRows(subjectByUid));
      await db.insert(uploadsTable).values({ source: "Instructor Demo Training", filename: "BigQuery sync (niat_session_wise_qa_rating DEMO + TRAINING_DEMO and AI assessments, per instructor + lecture-list course)", rowCount: demos });
    } catch (e) {
      console.error("[demo-training] sync failed:", e);
      await db.insert(uploadsTable).values({ source: "Instructor Demo Training FAILED", filename: `demos step failed: ${String((e as Error)?.message ?? e).slice(0, 900)}`, rowCount: 0 }).catch(() => {});
    }
    return { ok: true, source: "training_status_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof InstructorLearningStatusError ? e.message : describeUnexpectedError(e);
    return { ok: false, source: "training_status_live", error: message, synced_at: new Date().toISOString() };
  }
}


// One sync at a time (2026-10-08): the daily job, the catch-up and every Sync
// Now share one database lock (lib/syncContext.ts), so overlapping runs --
// which blanked each other's half-filled data -- can no longer happen. A
// manual click while something else is syncing gets a clear "already running"
// answer and does not overwrite the last real result.
export const SYNC_BUSY_MESSAGE = "Another sync is already running (the daily sync or someone else's Sync Now). Wait a few minutes and try again.";
type ExclusiveResult = SyncResult & { busy?: boolean };

async function runExclusive(source: string, run: () => Promise<SyncResult>): Promise<ExclusiveResult> {
  const out = await withSyncLock(run);
  if (out.ran) return out.value;
  return { ok: false, source, error: SYNC_BUSY_MESSAGE, synced_at: new Date().toISOString(), busy: true };
}

router.post("/sync/training-status", async (_req, res) => {
  const result = await runExclusive("training_status_live", runTrainingStatusSync);
  if (!result.busy) LAST_SYNC.training_status_live = result;
  res.json(result);
});

// Instructor Contribution (2026-09-24, per request) -- same "aggregate in
// BigQuery, store the aggregate" shape as runTrainingStatusSync() above, no
// reconciliation step needed here either: contribution rows are matched
// against instructorsTable.teachosUserId at read time (see GET
// /reports/instructor-contribution in reports.ts), same as training status.
async function runContributionSync(): Promise<SyncResult> {
  try {
    const rows = await fetchContributionRows();
    const stored = await storeContribution(rows);
    // Per-day rows for the Contribution tab's date filter (2026-10-12).
    await storeContributionDaily(await fetchContributionDailyRows());
    // Demo and AI-assessment hours (2026-10-14, per request). Never fails the Contribution sync: if this part breaks (or its table has
    // not been pushed yet) the sessions data above is still saved and the Demo / AI columns just keep their last values.
    try {
      const evaluationRows = await fetchEvaluationDailyRows();
      await inSavepoint(() => storeEvaluationDaily(evaluationRows));
    } catch (e) {
      console.error("[contribution] demo / AI assessment hours not updated:", (e as Error).message);
    }
    // Learning time (2026-10-15, per request) -- same rule: non-fatal.
    try {
      const timeSpentRows = await fetchTimeSpentDailyRows();
      await inSavepoint(() => storeTimeSpentDaily(timeSpentRows));
    } catch (e) {
      console.error("[contribution] learning hours not updated:", (e as Error).message);
    }
    // Keep the Instructor Archive's copy of the contribution data current (2026-10-13).
    await snapshotTeachosDataIntoArchive().catch((e) => console.error("[archive] contribution snapshot failed:", e));
    await db.insert(uploadsTable).values({ source: "Instructor Contribution", filename: "BigQuery sync (niat_instructor_session_schedule_details, aggregated per instructor)", rowCount: stored });
    return { ok: true, source: "contribution_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof InstructorContributionError ? e.message : describeUnexpectedError(e);
    return { ok: false, source: "contribution_live", error: message, synced_at: new Date().toISOString() };
  }
}

router.post("/sync/instructor-contribution", async (_req, res) => {
  const result = await runExclusive("contribution_live", runContributionSync);
  if (!result.busy) LAST_SYNC.contribution_live = result;
  res.json(result);
});

router.post("/sync/niat-instructor-details", async (_req, res) => {
  const result = await runExclusive("niat_instructor_details_live", runNiatInstructorDetailsSync);
  if (!result.busy) LAST_SYNC.niat_instructor_details_live = result;
  res.json(result);
});

router.get("/sync/niat-instructor-details/data", async (_req, res) => {
  try {
    const rows = await fetchNiatInstructorDetailsRows();
    res.json({ count: rows.length, rows });
  } catch (e) {
    const message = e instanceof NiatInstructorDetailsError ? e.message : describeUnexpectedError(e);
    res.status(500).json({ ok: false, error: message });
  }
});

router.post("/sync/darwinbox", async (_req, res) => {
  const result = await runExclusive("darwinbox_live", runDarwinboxSync);
  if (!result.busy) LAST_SYNC.darwinbox_live = result;
  res.json(result);
});

router.post("/sync/darwinbox-exits", async (_req, res) => {
  const result = await runExclusive("darwinbox_exits_live", runDarwinboxExitsSync);
  if (!result.busy) LAST_SYNC.darwinbox_exits_live = result;
  res.json(result);
});

router.post("/sync/teachos", async (_req, res) => {
  const result = await runExclusive("teachos_live", runTeachosSync);
  if (!result.busy) LAST_SYNC.teachos_live = result;
  res.json(result);
});

// Sync health (2026-10-14, per request: "we need to see when a sync silently goes wrong"). Built only from the uploads history and the
// stored exit rows, so it survives restarts and needs no new table. For every live source: when it last succeeded, whether that
// covers the most recent 5:00 AM IST run, and whether the last run's row count dropped sharply against the run before it.
// For the exits: how old Darwin's base report snapshot is, how many people came from the Offboarding fallback, and how many were
// kept from earlier syncs.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function mostRecentDailyRun(now: Date): Date {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  let candidate = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 5, 0, 0);
  if (candidate > istNow.getTime()) candidate -= 24 * 3600 * 1000;
  return new Date(candidate - IST_OFFSET_MS);
}
const HEALTH_SOURCES = [
  { source: "Darwin", label: "Darwin HRMS" },
  { source: "Exit List", label: "Darwin Exits" },
  { source: "TeachOS", label: "TeachOS" },
  { source: "Instructor Training Status", label: "Training Stats" },
  { source: "Instructor Contribution", label: "Contribution" },
] as const;

router.get("/sync/health", async (_req, res) => {
  const now = new Date();
  const dueSince = mostRecentDailyRun(now);
  const history = await db.select().from(uploadsTable).orderBy(desc(uploadsTable.uploadedAt)).limit(400);
  const sources = HEALTH_SOURCES.map((h) => {
    const runs = history.filter((u) => u.source === h.source);
    const last = runs[0];
    const prev = runs[1];
    const hoursSince = last ? Math.round(((now.getTime() - last.uploadedAt.getTime()) / 3600000) * 10) / 10 : null;
    const upToDate = !!last && last.uploadedAt >= dueSince;
    const rowDrop = last && prev && prev.rowCount > 0 && last.rowCount < prev.rowCount * 0.97 ? { from: prev.rowCount, to: last.rowCount } : null;
    const warnings: string[] = [];
    if (!last) warnings.push("Never synced.");
    else if (!upToDate) warnings.push(`Has not synced since the last 5:00 AM IST run (last success ${hoursSince}h ago).`);
    if (rowDrop) warnings.push(`Row count dropped from ${rowDrop.from} to ${rowDrop.to} on the last run.`);
    return { source: h.source, label: h.label, last_success_at: last?.uploadedAt ?? null, hours_since: hoursSince, last_rows: last?.rowCount ?? null, up_to_date: upToDate, row_drop: rowDrop, warnings };
  });

  const exitRows = await db.select({ employeeId: darwinboxExitsTable.employeeId, rawData: darwinboxExitsTable.rawData, syncedAt: darwinboxExitsTable.syncedAt }).from(darwinboxExitsTable);
  const people = new Set(exitRows.map((r) => (r.employeeId ?? "").trim().toLowerCase()).filter(Boolean));
  const sourceOf = (r: (typeof exitRows)[number]) => String((r.rawData as Record<string, unknown> | null)?.["Exit Source"] ?? "");
  const fallbackRows = exitRows.filter((r) => sourceOf(r).startsWith("Offboarding tracking")).length;
  const keptRows = exitRows.filter((r) => sourceOf(r).startsWith("Kept from an earlier sync")).length;
  let newestRequest = "";
  for (const r of exitRows) {
    const raw = (r.rawData ?? {}) as Record<string, unknown>;
    const t = String(raw["Separation Requested On"] ?? raw["Exit Date"] ?? "").trim();
    const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    const iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : "";
    if (iso > newestRequest) newestRequest = iso;
  }
  const lastExit = history.find((u) => u.source === "Exit List");
  const generated = lastExit?.filename.match(/base report generated ([^;\]]+)/)?.[1]?.trim() ?? null;
  const generatedMs = generated && generated !== "unknown" ? Date.parse(generated) : NaN;
  const baseAgeHours = Number.isNaN(generatedMs) ? null : Math.round(((now.getTime() - generatedMs) / 3600000) * 10) / 10;
  const exitWarnings: string[] = [];
  // Darwin regenerates the base report WEEKLY (Fridays ~8:07 AM IST; confirmed 2026-10-19 with _tmp_exit_staleness.ts: our syncs ran
  // several times a day and Darwin's live copy was still the 16 Oct one). So 3-6 days old is normal; only warn past 8 days (= a missed week).
  if (baseAgeHours !== null && baseAgeHours > 8 * 24) exitWarnings.push(`Darwin's base exit report was last generated ${baseAgeHours} hours ago (${generated}) -- it normally refreshes every Friday morning, so this week's refresh was missed. Resignations raised since then come only from the Offboarding-tracking fallback. Ask the Darwin admin to check the report's weekly schedule.`);
  if (keptRows > 0) exitWarnings.push(`${keptRows} exit row(s) were kept from earlier syncs because Darwin no longer returns them.`);
  res.json({
    generated_at: now.toISOString(),
    last_due_run: dueSince.toISOString(),
    sources,
    exits: {
      stored_rows: exitRows.length,
      people: people.size,
      newest_stored_request_date: newestRequest || null,
      from_offboarding_fallback: fallbackRows,
      kept_from_earlier_syncs: keptRows,
      base_report_generated_at: generated && generated !== "unknown" ? generated : null,
      base_report_age_hours: baseAgeHours,
      last_synced_at: exitRows.reduce<Date | null>((m, r) => (!m || r.syncedAt > m ? r.syncedAt : m), null),
      warnings: exitWarnings,
    },
  });
});

router.get("/sync/status", (_req, res) => {
  res.json({
    darwinbox: { auto_sync_interval_hours: DAILY_AUTO_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.darwinbox_live },
    darwinbox_exits: { auto_sync_interval_hours: DAILY_AUTO_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.darwinbox_exits_live },
    teachos: { auto_sync_interval_hours: DAILY_AUTO_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.teachos_live },
    training_status: { auto_sync_interval_hours: DAILY_AUTO_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.training_status_live },
    contribution: { auto_sync_interval_hours: DAILY_AUTO_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.contribution_live },
    // Deliberately NOT part of the daily 5am job -- see comment on
    // runNiatInstructorDetailsSync() above, still manual-only via its own
    // Uploads-page tile.
    niat_instructor_details: { auto_sync_interval_hours: 0, last_sync: LAST_SYNC.niat_instructor_details_live },
    // Capability Manager enrichment (2026-09-08, per request): a separate,
    // non-fatal sub-step of the TeachOS sync above -- teachos.last_sync can
    // say ok:true even when this failed silently, so it's tracked and
    // surfaced on its own here. Check this field's `error` after clicking
    // Sync Now for TeachOS if the Capability Manager column stays empty.
    capability_manager_enrichment: { last_sync: LAST_CAPABILITY_MANAGER_SYNC.current },
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

export { runDarwinboxSync, runDarwinboxExitsSync, runTeachosSync, runTrainingStatusSync, runContributionSync };
export default router;
