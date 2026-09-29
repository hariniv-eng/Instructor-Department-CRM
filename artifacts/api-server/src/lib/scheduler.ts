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
import { logger } from "./logger";
import { runDarwinboxSync, runDarwinboxExitsSync, runTeachosSync, runTrainingStatusSync, runContributionSync } from "../routes/sync";
import { LAST_SYNC } from "./syncState";

const DAILY_SYNC_CRON_EXPRESSION = "0 5 * * *"; // 05:00, every day
const DAILY_SYNC_TIMEZONE = "Asia/Kolkata"; // 5am IST

async function runDailyAutoSync() {
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

export function startScheduler() {
  cron.schedule(DAILY_SYNC_CRON_EXPRESSION, runDailyAutoSync, { timezone: DAILY_SYNC_TIMEZONE });
  logger.info({ cron: DAILY_SYNC_CRON_EXPRESSION, timezone: DAILY_SYNC_TIMEZONE }, "Daily auto-sync scheduled (Darwin, Darwin Exits, TeachOS, Training Status, Contribution)");
}
