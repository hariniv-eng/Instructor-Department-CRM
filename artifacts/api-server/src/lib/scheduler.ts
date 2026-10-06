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
import { desc, eq } from "drizzle-orm";
import { db, uploadsTable, instructorArchiveTable } from "@workspace/db";
import { archiveInstructors } from "./archiveInstructors";
import { logger } from "./logger";
import { runDarwinboxSync, runDarwinboxExitsSync, runTeachosSync, runTrainingStatusSync, runContributionSync } from "../routes/sync";
import { LAST_SYNC } from "./syncState";

const DAILY_SYNC_CRON_EXPRESSION = "0 5 * * *"; // 05:00, every day
const DAILY_SYNC_TIMEZONE = "Asia/Kolkata"; // 5am IST

// Guards against the cron tick and a catch-up check (below) overlapping in
// the same process -- each run is a full replace of every source, so a
// second concurrent run would just be wasted work (and hammer Darwin/BigQuery).
let dailySyncRunning = false;

async function runDailyAutoSync() {
  if (dailySyncRunning) {
    logger.info("Daily auto-sync already running -- skipping duplicate trigger");
    return;
  }
  dailySyncRunning = true;
  try {
    await runDailyAutoSyncInner();
  } finally {
    dailySyncRunning = false;
  }
}

async function runDailyAutoSyncInner() {
  logger.info("Daily 5am auto-sync starting");

  const darwinbox = await runDarwinboxSync();
  LAST_SYNC.darwinbox_live = darwinbox;
  if (!darwinbox.ok) logger.warn({ err: darwinbox.error }, "Darwinbox auto-sync failed");

  const darwinboxExits = await runDarwinboxExitsSync();
  LAST_SYNC.darwinbox_exits_live = darwinboxExits;
  if (!darwinboxExits.ok) logger.warn({ err: darwinboxExits.error }, "Darwinbox exits auto-sync failed");

  const teachos = await runTeachosSync();
  LAST_SYNC.teachos_live = teachos;
  if (!teachos.ok) logger.warn({ err: teachos.error }, "TeachOS/BigQuery auto-sync failed");

  const trainingStatus = await runTrainingStatusSync();
  LAST_SYNC.training_status_live = trainingStatus;
  if (!trainingStatus.ok) logger.warn({ err: trainingStatus.error }, "Instructor Training Status auto-sync failed");

  const contribution = await runContributionSync();
  LAST_SYNC.contribution_live = contribution;
  if (!contribution.ok) logger.warn({ err: contribution.error }, "Instructor Contribution auto-sync failed");

  logger.info("Daily 5am auto-sync finished");
}

// Catch-up for missed 5am runs (2026-10-06, per report: "the sync didnt
// happen in the morning"). The cron job above lives INSIDE this process, and
// the Replit deployment is Autoscale (.replit: deploymentTarget =
// "autoscale"), which shuts the server down while nobody is using it
// overnight -- so at 5:00 AM IST there was no running process to fire the
// timer, and the last recorded sync stayed at the previous afternoon's
// manual run. Fix (no infrastructure/cost change): whenever the process
// starts -- which on Autoscale is exactly what a first-visitor-of-the-day
// wake-up is -- and then every 30 minutes while it stays up, compare the
// newest recorded Darwin sync (uploads table, the same DB-backed history the
// Uploads page's "Last synced" reads, so it survives restarts unlike
// LAST_SYNC) against the most recent 5:00 AM IST that has already passed,
// and run the full daily sync right away if it's older. Darwin is used as
// the marker because the daily job always runs it first and only records an
// uploads row when it succeeds -- so a failed run is retried at the next
// check instead of being treated as done.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // Asia/Kolkata has no DST
const CATCH_UP_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const CATCH_UP_STARTUP_DELAY_MS = 30 * 1000; // let the server finish booting and serve its first request first

// The most recent 05:00 IST at or before `now`, as a real UTC instant.
function mostRecentScheduledRun(now: Date): Date {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  let candidateIst = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 5, 0, 0);
  if (candidateIst > istNow.getTime()) candidateIst -= 24 * 60 * 60 * 1000;
  return new Date(candidateIst - IST_OFFSET_MS);
}

async function runCatchUpIfOverdue() {
  try {
    const [latest] = await db.select({ uploadedAt: uploadsTable.uploadedAt }).from(uploadsTable).where(eq(uploadsTable.source, "Darwin")).orderBy(desc(uploadsTable.uploadedAt)).limit(1);
    const dueSince = mostRecentScheduledRun(new Date());
    if (latest && latest.uploadedAt >= dueSince) return;
    logger.info({ lastDarwinSync: latest?.uploadedAt ?? null, dueSince }, "Daily auto-sync overdue (missed the 5am run) -- running catch-up sync now");
    await runDailyAutoSync();
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
  cron.schedule(DAILY_SYNC_CRON_EXPRESSION, runDailyAutoSync, { timezone: DAILY_SYNC_TIMEZONE });
  logger.info({ cron: DAILY_SYNC_CRON_EXPRESSION, timezone: DAILY_SYNC_TIMEZONE }, "Daily auto-sync scheduled (Darwin, Darwin Exits, TeachOS, Training Status, Contribution)");

  setTimeout(seedArchiveScopeIfEmpty, 5 * 1000);
  setTimeout(runCatchUpIfOverdue, CATCH_UP_STARTUP_DELAY_MS);
  setInterval(runCatchUpIfOverdue, CATCH_UP_CHECK_INTERVAL_MS);
}
