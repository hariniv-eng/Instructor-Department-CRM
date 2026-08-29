// In-memory record of the most recent sync attempt per live source, shared
// by routes/sync.ts ("Sync Now") and lib/scheduler.ts (background auto-
// sync) so GET /api/sync/status reflects whichever ran most recently.
// Resets on process restart — swap for a DB-backed read later if you want
// it to survive restarts (e.g. store on the most recent matching `uploads`
// row instead).

export type SyncResult =
  | { ok: true; source: string; stored: number; synced_at: string }
  | { ok: false; source: string; error: string; synced_at: string };

export const LAST_SYNC: Record<"darwinbox_live" | "darwinbox_exits_live" | "teachos_live", SyncResult | null> = {
  darwinbox_live: null,
  darwinbox_exits_live: null,
  teachos_live: null,
};
