// Background auto-sync, once a day at a fixed wall-clock time (2026-09-29,
// per request: "every day at 5am it has to be auto-synced... it has to be
// changed to every 24 hours" -- replacing the previous per-source
// hour-interval schedule (DARWINBOX_SYNC_INTERVAL_HOURS etc., every 12h
// from whenever the server happened to start) with a single fixed daily
// job covering every live source we have, not just the three that used to
// be wired in. Manual "Sync Now" (on the Uploads page, and on the
// Contribution / Training Stats tabs) still works independently, any time.
//
// Runs sequentially, not in parallel, so we're not hammering Darwin's API
// and BigQuery at the same moment every morning -- and each source's
// failure is caught and logged on its own (same non-fatal-per-source
// pattern runTeachosSync() already uses for its Capability Manager
// sub-step), so one source being down for the day doesn't block the
// others from refreshing. Started once from index.ts after the server
// starts listening.
//
// DAILY_AUTO_SYNC_SCHEDULE_LABEL (syncState.ts) is the human-readable
// version of this same "5:00 AM IST" schedule, shown on GET /sync/status
// -- keep both in sync if this cron expression/timezone ever changes.

import cron from "node-cron";
import { eq, max } from "drizzle-orm";
import { db, uploadsTable, instructorArchiveTable } from "@workspace/db";
import { archiveInstructors } from "./archiveInstructors";
import { logger } from "./logger";
import { runDarwinboxSync, runDarwinboxExitsSync, runTeachosSync, runTrainingStatusSync, runContributionSync } from "../routes/sync";
import { withSyncLock } from "./syncContext";
import { LAST_SYNC } from "./syncState";

const DAILY_SYNC_CRON_EXPRESSION = "0 5 * * *"; // 05:00, every day
const DAILY_SYNC_TIMEZONE = "Asia/Kolkata"; // 5am IST

// The sources the daily job refreshes, in the order it refreshes them.
// `uploadSource` is the name each successful run records in the uploads table
// -- that history is what "is this source up to date for today?" is judged
// against (it survives restarts, unlike LAST_SYNC).
const DAILY_SOURCES = [
  { uploadSource: "Darwin", key: "darwinbox_live", label: "Darwinbox", run: runDarwinboxSync },
  { uploadSource: "Exit List", key: "darwinbox_exits_live", label: "Darwinbox exits", run: runDarwinboxExitsSync },
  { uploadSource: "TeachOS", key: "teachos_live", label: "TeachOS/BigQuery", run: runTeachosSync },
  { uploadSource: "Instructor Training Status", key: "training_status_live", label: "Instructor Training Status", run: runTrainingStatusSync },
  { uploadSource: "Instructor Contribution", key: "contribution_live", label: "Instructor Contribution", run: runContributionSync },
] as const;

export type DailySyncOutcome =
  | { ran: false; reason: "already_running" | "up_to_date" }
  | { ran: true; results: Array<{ source: string; ok: boolean; error?: string }> };

// Runs the given sources (all of them by default) one after another, holding
// the shared sync lock for the whole run (lib/syncContext.ts) so two server
// processes -- Autoscale can wake several at once -- never sync at the same
// time. Each source's failure is caught on its own, so one source being down
// does not block the others.
async function runSources(only?: ReadonlySet<string>): Promise<DailySyncOutcome> {
  const locked = await withSyncLock(async () => {
    logger.info({ only: only ? [...only] : "all" }, "Daily auto-sync starting");
    const results: Array<{ source: string; ok: boolean; error?: string }> = [];
    for (const s of DAILY_SOURCES) {
      if (only && !only.has(s.uploadSource)) continue;
      const result = await s.run();
      LAST_SYNC[s.key] = result;
      if (!result.ok) logger.warn({ err: result.error }, `${s.label} auto-sync failed`);
      results.push({ source: s.uploadSource, ok: result.ok, error: result.ok ? undefined : result.error });
    }
    logger.info("Daily auto-sync finished");
    return results;
  });
  if (!locked.ran) {
    logger.info("Daily auto-sync skipped -- another sync is already running");
    return { ran: false, reason: "already_running" };
  }
  return { ran: true, results: locked.value };
}

// Catch-up for missed 5am runs. The cron timer below lives INSIDE this
// process, and the Replit deployment is Autoscale (.replit: deploymentTarget
// = "autoscale"), which shuts the server down while nobody is using it -- so
// at 5:00 AM IST there is often no running process to fire the timer
// (2026-10-06 and again 2026-10-08: "the sync didnt happen in the morning").
//
// Two things now cover that:
//   1. An outside scheduler (GitHub Actions, see
//      .github/workflows/daily-sync.yml) calls POST /api/sync/daily at 5:00 AM
//      IST (routes/cron.ts). The request itself wakes the server, and stays
//      open until the sync finishes so the server cannot go back to sleep
//      halfway through.
//   2. This catch-up, which runs shortly after every server start and then
//      every 30 minutes while it stays up. It now judges EACH source against
//      the most recent 5:00 AM IST that has passed and re-runs only the
//      sources that are behind (before: it looked at Darwin alone and always
//      re-ran everything, so one failing source re-synced all five every 30
//      minutes). A failed run records nothing, so it is retried next check.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // Asia/Kolkata has no DST
const CATCH_UP_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const CATCH_UP_STARTUP_DELAY_MS = 5 * 1000; // just enough for the server to start answering requests

// The most recent 05:00 IST at or before `now`, as a real UTC instant.
function mostRecentScheduledRun(now: Date): Date {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  let candidateIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 5, 0, 0);
  if (candidateIst > istNow.getTime()) candidateIst -= 24 * 60 * 60 * 1000;
  return new Date(candidateIst - IST_OFFSET_MS);
}

async function overdueSources(dueSince: Date): Promise<Set<string>> {
  const rows = await db
    .select({ source: uploadsTable.source, latest: max(uploadsTable.uploadedAt) })
    .from(uploadsTable)
    .groupBy(uploadsTable.source);
  const latestBySource = new Map(rows.map((r) => [r.source, r.latest]));
  const overdue = new Set<string>();
  for (const s of DAILY_SOURCES) {
    const latest = latestBySource.get(s.uploadSource);
    if (!latest || latest < dueSince) overdue.add(s.uploadSource);
  }
  return overdue;
}

// `graceMs` lets the 5am request still count as "due" if the outside
// scheduler's clock fires a few minutes before 5:00 sharp.
export async function runDailySyncIfDue(graceMs = 0): Promise<DailySyncOutcome> {
  const dueSince = mostRecentScheduledRun(new Date(Date.now() + graceMs));
  const overdue = await overdueSources(dueSince);
  if (overdue.size === 0) return { ran: false, reason: "up_to_date" };
  logger.info({ dueSince, overdue: [...overdue] }, "Daily auto-sync due -- running now");
  return runSources(overdue);
}

async function runCatchUpIfOverdue() {
  try {
    await runDailySyncIfDue();
  } catch (err) {
    logger.warn({ err }, "Auto-sync catch-up check failed");
  }
}

// One-time baseline for the Instructor Archive's inArchiveScope marker
// (2026-10-06). The column starts out false for every existing row, and the
// Archive page shows only flagged rows -- so right after this ships the page
// would be empty until the next sync happened to run archiveInstructors().
// archiveInstructors() only touches the database (no Darwin/BigQuery calls),
// so when NO archive row is flagged yet, just run it once at startup to take
// today's snapshot of who is in the department. After that at least one row
// is always flagged, and this check is a cheap no-op.
async function seedArchiveScopeIfEmpty() {
  try {
    const [flagged] = await db.select({ id: instructorArchiveTable.id }).from(instructorArchiveTable).where(eq(instructorArchiveTable.inArchiveScope, true)).limit(1);
    if (flagged) return;
    const result = await archiveInstructors();
    logger.info(result, "Instructor Archive baseline taken (inArchiveScope seeded from today's department)");
  } catch (err) {
    logger.warn({ err }, "Instructor Archive baseline seeding failed");
  }
}

export function startScheduler() {
  cron.schedule(DAILY_SYNC_CRON_EXPRESSION, runCatchUpIfOverdue, { timezone: DAILY_SYNC_TIMEZONE });
  logger.info({ cron: DAILY_SYNC_CRON_EXPRESSION, timezone: DAILY_SYNC_TIMEZONE }, "Daily auto-sync scheduled (Darwin, Darwin Exits, TeachOS, Training Status, Contribution)");

  setTimeout(seedArchiveScopeIfEmpty, 5 * 1000);
  setTimeout(runCatchUpIfOverdue, CATCH_UP_STARTUP_DELAY_MS);
  setInterval(runCatchUpIfOverdue, CATCH_UP_CHECK_INTERVAL_MS);
  setInterval(seedArchiveScopeIfEmpty, CATCH_UP_CHECK_INTERVAL_MS);
}
