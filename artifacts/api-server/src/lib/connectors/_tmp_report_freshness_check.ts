// One-off, READ-ONLY (2026-10-15): for the base exit report and every enrichment report, prints when Darwin says the report was last
// generated (response.summary.current_report_time_in_utc), how old that is, how many rows it returned, and the rest of its summary
// block, so we can see which reports are live and which are stale snapshots. Writes nothing.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_report_freshness_check.ts
import { config } from "./config";
import { fetchRawReportResponse, parseEnrichReportIds } from "./darwinboxExits";

const NAMES: Record<string, string> = {
  "24023a61b78742": "Base exit report (deactivated report)",
  "70c916bd0ed8bb": "EIF Main",
  "1d513a4ccdf2e8": "TA Employee Master",
  "9feb118d44726a": "Offboarding tracking",
  "853905cf311922": "L&D Details",
};

function findRows(v: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (depth < 3 && v && typeof v === "object") for (const k of ["response", "data", "report_data", "records", "result", "rows", "list", "items", "details"]) {
    const x = (v as Record<string, unknown>)[k];
    if (x != null) { const f = findRows(x, depth + 1); if (f) return f; }
  }
  return null;
}

async function main() {
  const ids = [config.DBX_CHECK_REPORT_ID!, ...parseEnrichReportIds()];
  console.log(`Now: ${new Date().toISOString()}\n`);
  for (const id of ids) {
    console.log(`=== ${id}  ${NAMES[id] ?? ""}`);
    try {
      const raw = (await fetchRawReportResponse(id)) as { response?: { summary?: Record<string, unknown> } } | null;
      const summary = raw?.response?.summary ?? {};
      const stamp = summary["current_report_time_in_utc"] as string | undefined;
      const age = stamp ? (Date.now() - Date.parse(stamp)) / 3600000 : NaN;
      const rows = findRows(raw);
      console.log(`  rows returned: ${rows ? rows.length : "(none found)"}`);
      console.log(`  generated at : ${stamp ?? "(no timestamp in the response)"}${Number.isNaN(age) ? "" : `  -> ${age.toFixed(1)} hours ago`}`);
      console.log(`  summary      : ${JSON.stringify(summary).slice(0, 600)}`);
    } catch (e) {
      console.log(`  FAILED: ${(e as Error).message.slice(0, 400)}`);
    }
    console.log("");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
