// Background auto-sync on the intervals set in .env
// (DARWINBOX_SYNC_INTERVAL_HOURS, DARWINBOX_EXITS_SYNC_INTERVAL_HOURS,
// BIGQUERY_SYNC_INTERVAL_HOURS) — set any of them to 0 to disable auto-sync
// for that source (manual "Sync Now" from the Upload page still works
// either way). Started once from index.ts after the server starts
// listening.

import cron from "node-cron";
import { logger } from "./logger";
import { config } from "./connectors/config";
import { runDarwinboxSync, runDarwinboxExitsSync, runTeachosSync } from "../routes/sync";
import { LAST_SYNC } from "./syncState";

function cronExprForHours(hours: number): string {
  const h = Math.max(1, Math.round(hours));
  return `0 */${h} * * *`; // minute 0, every h hours
}

export function startScheduler() {
  if (config.DARWINBOX_SYNC_INTERVAL_HOURS > 0) {
    cron.schedule(cronExprForHours(config.DARWINBOX_SYNC_INTERVAL_HOURS), async () => {
      const result = await runDarwinboxSync();
      LAST_SYNC.darwinbox_live = result;
      if (!result.ok) logger.warn({ err: result.error }, "Darwinbox auto-sync failed");
    });
    logger.info({ hours: config.DARWINBOX_SYNC_INTERVAL_HOURS }, "Darwinbox auto-sync scheduled");
  }

  if (config.DARWINBOX_EXITS_SYNC_INTERVAL_HOURS > 0) {
    cron.schedule(cronExprForHours(config.DARWINBOX_EXITS_SYNC_INTERVAL_HOURS), async () => {
      const result = await runDarwinboxExitsSync();
      LAST_SYNC.darwinbox_exits_live = result;
      if (!result.ok) logger.warn({ err: result.error }, "Darwinbox exits auto-sync failed");
    });
    logger.info({ hours: config.DARWINBOX_EXITS_SYNC_INTERVAL_HOURS }, "Darwinbox exits auto-sync scheduled");
  }

  if (config.BIGQUERY_SYNC_INTERVAL_HOURS > 0) {
    cron.schedule(cronExprForHours(config.BIGQUERY_SYNC_INTERVAL_HOURS), async () => {
      const result = await runTeachosSync();
      LAST_SYNC.teachos_live = result;
      if (!result.ok) logger.warn({ err: result.error }, "TeachOS/BigQuery auto-sync failed");
    });
    logger.info({ hours: config.BIGQUERY_SYNC_INTERVAL_HOURS }, "TeachOS/BigQuery auto-sync scheduled");
  }
}
