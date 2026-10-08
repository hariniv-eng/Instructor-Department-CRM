// Shared plumbing for the live syncs (2026-10-08, per report: headcount
// changed on every refresh, and the 5am sync "didn't happen").
//
// Two problems, two tools:
//
// 1. Readers saw half-rebuilt data. Every sync blanks fields for everyone
//    (reconcileTeachos clears inTeachos, reconcileDarwin clears department /
//    designation, ...) and then refills them one person at a time. Any page
//    load in between counted a partial table. inSyncTransaction() runs the
//    whole "store + reconcile" step of a sync inside ONE database transaction,
//    so other requests keep reading the previous, complete data until the new
//    data is committed all at once (Postgres MVCC -- readers never block).
//    `sdb` is the database handle the sync code uses: it points at the
//    running transaction when there is one, and at the normal pool handle
//    otherwise (manual CSV uploads etc. are unaffected).
//
// 2. Several syncs ran on top of each other. Autoscale can wake more than one
//    server process at once, and each ran its own catch-up sync; Sync Now
//    clicks added more. withSyncLock() takes a Postgres advisory lock (shared
//    by every process on the same database) so only one sync runs at a time;
//    the others skip or report "already running". The lock belongs to a
//    dedicated connection, so it is released even if the process dies.

import { AsyncLocalStorage } from "node:async_hooks";
import { db, pool } from "@workspace/db";

type Db = typeof db;

const txStorage = new AsyncLocalStorage<Db>();

export const sdb: Db = new Proxy(db, {
  get(_target, prop) {
    const active = (txStorage.getStore() ?? db) as unknown as Record<string | symbol, unknown>;
    const value = active[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(active) : value;
  },
});

// Runs `fn` with every `sdb` call inside it (including nested calls and
// everything it awaits) going through one transaction. Rolls back on throw.
export async function inSyncTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => txStorage.run(tx as unknown as Db, fn));
}

// A nested transaction (a savepoint when already inside inSyncTransaction):
// if `fn` throws, only the work done inside it is rolled back and the outer
// transaction stays usable. For steps that are allowed to fail on their own.
export async function inSavepoint<T>(fn: () => Promise<T>): Promise<T> {
  return sdb.transaction(async (tx) => txStorage.run(tx as unknown as Db, fn));
}

const SYNC_LOCK_KEY = 8420011; // arbitrary, just has to be the same everywhere

export type LockResult<T> = { ran: true; value: T } | { ran: false };

export async function withSyncLock<T>(fn: () => Promise<T>): Promise<LockResult<T>> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("select pg_try_advisory_lock($1::bigint) as ok", [SYNC_LOCK_KEY]);
    if (!rows[0]?.ok) return { ran: false };
    try {
      return { ran: true, value: await fn() };
    } finally {
      await client.query("select pg_advisory_unlock($1::bigint)", [SYNC_LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}
