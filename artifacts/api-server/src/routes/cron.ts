// POST /api/sync/daily -- the 5:00 AM IST trigger for the daily sync
// (2026-10-08). Called by an OUTSIDE scheduler (GitHub Actions, see
// .github/workflows/daily-sync.yml), because on Replit Autoscale the server is
// asleep at 5am and its own in-process timer never fires; an incoming request
// is what wakes it.
//
// Protected by a shared secret (env SYNC_CRON_SECRET, sent as
// "Authorization: Bearer <secret>"), not by a login session -- there is no
// person behind this call. If the secret is not configured the endpoint is
// switched off entirely (503), never left open.
//
// The request is held open until the sync finishes, so Autoscale sees an
// active request and cannot scale the instance down mid-sync. A blank space is
// written every 15s so no proxy in between closes an "idle" connection; the
// body is still valid JSON (leading whitespace is allowed).
//
// Mounted in routes/index.ts BEFORE the admin-only routers.

import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { runDailySyncIfDue } from "../lib/scheduler";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Accept a request that arrives a little before 5:00 sharp (clock skew on the
// outside scheduler) as already "due".
const DUE_GRACE_MS = 15 * 60 * 1000;

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.post("/sync/daily", async (req, res) => {
  const expected = process.env.SYNC_CRON_SECRET;
  if (!expected) {
    res.status(503).json({ error: "SYNC_CRON_SECRET is not configured on the server" });
    return;
  }
  const header = req.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!provided || !secretMatches(provided, expected)) {
    res.status(401).json({ error: "Invalid sync token" });
    return;
  }

  res.status(200).type("application/json");
  res.flushHeaders();
  const keepAlive = setInterval(() => res.write(" "), 15 * 1000);
  try {
    const outcome = await runDailySyncIfDue(DUE_GRACE_MS);
    res.end(JSON.stringify(outcome));
  } catch (err) {
    logger.error({ err }, "Daily sync request failed");
    res.end(JSON.stringify({ ran: false, reason: "error", error: err instanceof Error ? err.message : String(err) }));
  } finally {
    clearInterval(keepAlive);
  }
});

export default router;
