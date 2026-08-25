import { Router, type IRouter } from "express";
import {
  db,
  uploadsTable,
  darwinboxActiveTable,
  darwinboxExitsTable,
  teachosDeploymentTable,
} from "@workspace/db";
import { desc } from "drizzle-orm";
import { config } from "../lib/connectors/config";
import { fetchDarwinRows, DarwinboxError } from "../lib/connectors/darwinbox";
import { fetchExitRows, DarwinboxExitsError } from "../lib/connectors/darwinboxExits";
import { fetchTeachosRows, BigQueryTeachosError } from "../lib/connectors/bigquery";
import { storeDarwinboxActive, storeDarwinboxExits, storeTeachosDeployment } from "../lib/storeRaw";
import { LAST_SYNC, type SyncResult } from "../lib/syncState";

const router: IRouter = Router();

// Each sync below only pulls from the source and replaces that source's own
// raw table (see lib/storeRaw.ts) — the 3 sources are kept fully separate,
// nothing is matched or merged into the instructors table here.

async function runDarwinboxSync(): Promise<SyncResult> {
  try {
    const rows = await fetchDarwinRows();
    const stored = await storeDarwinboxActive(rows);
    await db.insert(uploadsTable).values({ source: "Darwin", filename: "Darwinbox API sync (raw)", rowCount: stored });
    return { ok: true, source: "darwinbox_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof DarwinboxError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { ok: false, source: "darwinbox_live", error: message, synced_at: new Date().toISOString() };
  }
}

async function runDarwinboxExitsSync(): Promise<SyncResult> {
  try {
    const rows = await fetchExitRows();
    const stored = await storeDarwinboxExits(rows);
    await db.insert(uploadsTable).values({ source: "Exit List", filename: "Darwinbox reports-API sync (raw)", rowCount: stored });
    return { ok: true, source: "darwinbox_exits_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof DarwinboxExitsError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { ok: false, source: "darwinbox_exits_live", error: message, synced_at: new Date().toISOString() };
  }
}

async function runTeachosSync(): Promise<SyncResult> {
  try {
    const rows = await fetchTeachosRows();
    const stored = await storeTeachosDeployment(rows);
    await db.insert(uploadsTable).values({ source: "TeachOS", filename: "BigQuery sync (raw)", rowCount: stored });
    return { ok: true, source: "teachos_live", stored, synced_at: new Date().toISOString() };
  } catch (e) {
    const message = e instanceof BigQueryTeachosError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { ok: false, source: "teachos_live", error: message, synced_at: new Date().toISOString() };
  }
}

router.post("/sync/darwinbox", async (_req, res) => {
  const result = await runDarwinboxSync();
  LAST_SYNC.darwinbox_live = result;
  res.json(result);
});

router.post("/sync/darwinbox-exits", async (_req, res) => {
  const result = await runDarwinboxExitsSync();
  LAST_SYNC.darwinbox_exits_live = result;
  res.json(result);
});

router.post("/sync/teachos", async (_req, res) => {
  const result = await runTeachosSync();
  LAST_SYNC.teachos_live = result;
  res.json(result);
});

router.get("/sync/status", (_req, res) => {
  res.json({
    darwinbox: { auto_sync_interval_hours: config.DARWINBOX_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.darwinbox_live },
    darwinbox_exits: { auto_sync_interval_hours: config.DARWINBOX_EXITS_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.darwinbox_exits_live },
    teachos: { auto_sync_interval_hours: config.BIGQUERY_SYNC_INTERVAL_HOURS, last_sync: LAST_SYNC.teachos_live },
  });
});

// Plain read-only views of each source's current raw snapshot — not part of
// the OpenAPI spec yet (no typed frontend hooks), just for verifying via
// curl/Invoke-WebRequest that a sync actually stored what you expect. These
// can get wired into the OpenAPI spec + frontend once the mapping/reconcile
// step is designed.
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

export { runDarwinboxSync, runDarwinboxExitsSync, runTeachosSync };
export default router;
