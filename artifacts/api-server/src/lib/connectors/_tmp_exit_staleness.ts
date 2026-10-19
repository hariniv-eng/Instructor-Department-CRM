// One-off, READ-ONLY (2026-10-19): the Sync health page says the base exit report is 74 hours old. That stamp comes from the LAST
// STORED exits sync, so it is stale either because (a) our syncs since 16 Oct did not run / did not store, or (b) Darwin has not
// regenerated the report since 16 Oct (it may only do so weekly: the 9 Oct and 16 Oct copies are exactly 7 days apart).
// This prints both sides: every "Exit List" sync stored in the last 10 days (when it ran + the report stamp it saw), and the stamp
// on the report Darwin returns RIGHT NOW. Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_exit_staleness.ts
import { and, desc, eq, gte } from "drizzle-orm";
import { db, uploadsTable } from "@workspace/db";
import { config } from "./config";
import { fetchRawReportResponse } from "./darwinboxExits";

const ist = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

async function main() {
  console.log(`Now: ${ist(new Date())} IST\n`);
  const since = new Date(Date.now() - 10 * 24 * 3600 * 1000);
  const runs = await db.select().from(uploadsTable)
    .where(and(eq(uploadsTable.source, "Exit List"), gte(uploadsTable.uploadedAt, since)))
    .orderBy(desc(uploadsTable.uploadedAt));
  console.log(`A) Exits syncs stored in the last 10 days: ${runs.length}`);
  for (const r of runs) {
    const stamp = r.filename.match(/base report generated ([^;\]]+)/)?.[1]?.trim() ?? "-";
    console.log(`  ran ${ist(r.uploadedAt)} IST | rows ${r.rowCount} | report stamp ${stamp}`);
  }
  console.log(`\nB) Base exit report as Darwin returns it right now:`);
  try {
    const raw = (await fetchRawReportResponse(config.DBX_CHECK_REPORT_ID!)) as { response?: { summary?: Record<string, unknown> } } | null;
    const stamp = raw?.response?.summary?.["current_report_time_in_utc"] as string | undefined;
    console.log(stamp ? `  generated ${stamp} = ${ist(new Date(stamp))} IST (${((Date.now() - Date.parse(stamp)) / 3600000).toFixed(1)} hours ago)` : "  (no timestamp in the response)");
  } catch (e) {
    console.log(`  FAILED: ${(e as Error).message.slice(0, 400)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
