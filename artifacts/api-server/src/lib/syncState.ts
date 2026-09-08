// In-memory record of the most recent sync attempt per live source, shared
// by routes/sync.ts ("Sync Now") and lib/scheduler.ts (background auto-
// sync) so GET /api/sync/status reflects whichever ran most recently.
// Resets on process restart — swap for a DB-backed read later if you want
// it to survive restarts (e.g. store on the most recent matching `uploads`
// row instead).

export type SyncResult =
  | { ok: true; source: string; stored: number; synced_at: string }
  | { ok: false; source: string; error: string; synced_at: string };

export const LAST_SYNC: Record<"darwinbox_live" | "darwinbox_exits_live" | "teachos_live" | "niat_instructor_details_live", SyncResult | null> = {
  darwinbox_live: null,
  darwinbox_exits_live: null,
  teachos_live: null,
  niat_instructor_details_live: null,
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
