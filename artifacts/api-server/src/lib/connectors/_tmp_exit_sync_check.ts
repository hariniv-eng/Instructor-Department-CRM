// One-off, READ-ONLY (2026-10-14): diagnoses why the Darwin exit data is not syncing. Writes nothing. It (1) checks the
// credentials are present, (2) fetches the live exit report and the offboarding fallback exactly like the sync does and prints any
// error or warning, (3) compares the live rows with what is stored in darwinbox_exits, and (4) shows the last Exit List syncs.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_exit_sync_check.ts
import { db, darwinboxExitsTable, uploadsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { config, missing } from "./config";
import { fetchExitRecords, fetchExitRows, parseEnrichReportIds } from "./darwinboxExits";
import { cell, toISODate } from "../reconcile";

const need = ["DBX_CHECK_ENDPOINT", "DBX_CHECK_USERNAME", "DBX_CHECK_PASSWORD", "DBX_CHECK_API_KEY", "DBX_CHECK_REPORT_ID"] as const;

async function main() {
  console.log("=== 1. Credentials ===");
  const miss = missing(need);
  console.log(miss.length ? `MISSING: ${miss.join(", ")}` : "All 5 exit-report settings are present.");
  console.log(`Enrichment report ids: ${parseEnrichReportIds().join(", ") || "(none)"}`);
  console.log(`Time now: ${new Date().toISOString()}`);

  console.log("\n=== 2. Base report (live) ===");
  try {
    const t0 = Date.now();
    const recs = await fetchExitRecords();
    console.log(`OK: ${recs.length} records in ${Date.now() - t0} ms`);
    const dates = recs.map((r) => toISODate(cell(r as any, "Date Of Resignation", "Separation Requested On") as string | null)).filter(Boolean) as string[];
    dates.sort();
    console.log(`Request dates: earliest ${dates[0] ?? "-"}, latest ${dates[dates.length - 1] ?? "-"}`);
  } catch (e) {
    console.log(`FAILED: ${(e as Error).message.slice(0, 1500)}`);
  }

  console.log("\n=== 3. Full fetch exactly as the sync does it (warnings from enrichment / fallback appear below) ===");
  let live: Record<string, unknown>[] = [];
  try {
    live = (await fetchExitRows()) as Record<string, unknown>[];
    const fallback = live.filter((r) => String(r["Exit Source"] ?? "").startsWith("Offboarding tracking")).length;
    console.log(`OK: ${live.length} rows (${fallback} added from the offboarding fallback)`);
  } catch (e) {
    console.log(`FAILED: ${(e as Error).message.slice(0, 1500)}`);
  }

  console.log("\n=== 4. Stored in the database (darwinbox_exits) ===");
  const stored = await db.select().from(darwinboxExitsTable);
  const newest = stored.reduce((m, r) => (r.syncedAt > m ? r.syncedAt : m), new Date(0));
  console.log(`${stored.length} rows stored, last written ${stored.length ? newest.toISOString() : "never"}`);
  const liveIds = new Set(live.map((r) => String(r["Employee Id"] ?? "").trim().toLowerCase()).filter(Boolean));
  const storedIds = new Set(stored.map((r) => String(r.employeeId ?? "").trim().toLowerCase()).filter(Boolean));
  const onlyLive = [...liveIds].filter((i) => !storedIds.has(i));
  const onlyStored = [...storedIds].filter((i) => !liveIds.has(i));
  console.log(`Live ids ${liveIds.size}, stored ids ${storedIds.size}`);
  console.log(`In live but NOT stored: ${onlyLive.length}${onlyLive.length ? " e.g. " + onlyLive.slice(0, 15).join(", ") : ""}`);
  console.log(`Stored but NOT in live: ${onlyStored.length}${onlyStored.length ? " e.g. " + onlyStored.slice(0, 15).join(", ") : ""}`);
  const countBy = (rows: Record<string, unknown>[]) => rows.reduce<Record<string, number>>((m, r) => { const s = String(cell(r as any, "Status", "status") ?? "(blank)").trim() || "(blank)"; m[s] = (m[s] ?? 0) + 1; return m; }, {});
  console.log("Status counts, live  :", JSON.stringify(countBy(live)));
  console.log("Status counts, stored:", JSON.stringify(countBy(stored.map((r) => (r.rawData ?? {}) as Record<string, unknown>))));

  console.log("\n=== 5. Last Exit List syncs recorded ===");
  const ups = await db.select().from(uploadsTable).where(eq(uploadsTable.source, "Exit List")).orderBy(desc(uploadsTable.uploadedAt)).limit(6);
  for (const u of ups) console.log(`${u.uploadedAt.toISOString()} | ${u.filename} | ${u.rowCount} rows`);
  if (!ups.length) console.log("No Exit List sync has ever been recorded.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
