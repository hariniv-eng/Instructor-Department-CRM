// In-memory record of the most recent sync attempt per live source, shared
// by routes/sync.ts ("Sync Now") and lib/scheduler.ts (background auto-
// sync) so GET /api/sync/status reflects whichever ran most recently.
// Resets on process restart — swap for a DB-backed read later if you want
// it to survive restarts (e.g. store on the most recent matching `uploads`
// row instead).

// The background auto-sync now runs once a day, at a fixed 5:00 AM IST
// wall-clock time, for every live source (Darwin, Darwin Exits, TeachOS,
// Training Status, Contribution) -- see lib/scheduler.ts for the actual
// cron job (2026-09-29, per request: "every day at 5am it has to be
// auto-synced... change it to every 24 hours", replacing the old
// per-source *_SYNC_INTERVAL_HOURS env vars, which ran every 12h from
// whenever the server happened to start rather than at a fixed time).
// GET /sync/status (routes/sync.ts) reports this as `auto_sync_interval_
// hours: 24` -- kept as the existing `number` field/type (not a new
// string field) deliberately, so no OpenAPI spec / generated client
// change is needed; the Uploads page's existing "Auto-syncs every Xh"
// text already reads correctly off the new value.
export const DAILY_AUTO_SYNC_INTERVAL_HOURS = 24;

export type SyncResult =
  | { ok: true; source: string; stored: number; synced_at: string }
  | { ok: false; source: string; error: string; synced_at: string };

export const LAST_SYNC: Record<"darwinbox_live" | "darwinbox_exits_live" | "teachos_live" | "niat_instructor_details_live" | "training_status_live" | "contribution_live", SyncResult | null> = {
  darwinbox_live: null,
  darwinbox_exits_live: null,
  teachos_live: null,
  niat_instructor_details_live: null,
  training_status_live: null,
  contribution_live: null,
};

// Result of the Capability Manager enrichment sub-step inside
// runTeachosSync() (routes/sync.ts) -- deliberately tracked separately from
// LAST_SYNC.teachos_live, since that non-fatal try/catch means the main
// TeachOS sync can report ok:true even when this specific sub-step failed
// silently. Surfaced on GET /api/sync/status (2026-09-08, per request) so
// the actual error is one authenticated request away instead of requiring
// a trip through the Replit deployment's own log viewer.
export type CapabilityManagerSyncResult =
  | {
      ok: true;
      matched: number;
      unmatched: number;
      // Candidate rows skipped because their manager name wasn't on the
      // maintained VALID_CAPABILITY_MANAGERS roster (see
      // ../data/validCapabilityManagers.ts) -- noise from the up-to-8
      // candidate rows the source carries per instructor.
      invalid: number;
      // Times "Garlapati Prudhvi Raj" was a valid candidate but got passed
      // over in favor of another valid manager also present for that
      // person -- see validCapabilityManagers.ts for why he's lowest
      // priority.
      droppedLowPriority: number;
      total_rows: number;
      synced_at: string;
    }
  | { ok: false; error: string; synced_at: string };

// A single-key record (not a reassigned `let`), matching LAST_SYNC's shape
// above -- mutated via property assignment so every importer reads the same
// live object, same as LAST_SYNC already relies on.
export const LAST_CAPABILITY_MANAGER_SYNC: { current: CapabilityManagerSyncResult | null } = { current: null };

export function setLastCapabilityManagerSync(result: CapabilityManagerSyncResult) {
  LAST_CAPABILITY_MANAGER_SYNC.current = result;
}
