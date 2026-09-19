// Client for Darwinbox's Reports Builder API (reportsbuilderapi/reportdatav2)
// — a pre-configured "exit employee details" custom report. There's no
// public spec for this endpoint the way there is for the Master API, so the
// report id is sent under a few plausible key names at once (harmless if
// the API ignores keys it doesn't recognize — only one needs to be right).
// Run `inspectDarwinboxExits()` once you have real network access.

import { config, missing } from "./config";
import { runWithHardTimeout, HardTimeout } from "./timeout";
import type { SheetRow } from "../reconcile";

export class DarwinboxExitsError extends Error {}

const REQUIRED = ["DBX_CHECK_ENDPOINT", "DBX_CHECK_USERNAME", "DBX_CHECK_PASSWORD", "DBX_CHECK_API_KEY", "DBX_CHECK_REPORT_ID"] as const;

// Confirmed live on 2026-08-26: this report's real fields are "Employee Id",
// "Employee Name", "Date Of Resignation", "Separation Requested On",
// "Separation Type" (often blank), and "Status" (e.g. "Revoked", seen in a
// live sample — meaning that resignation was cancelled, NOT a completed
// exit). The real field names are listed first in each list below so they
// match directly; the original snake_case guesses are kept as fallbacks in
// case the report's shape ever changes. "Status" is newly added — it isn't
// consumed by anything downstream yet, but it's important enough (it's the
// only signal distinguishing an actual completed exit from a revoked/
// pending resignation request) that it needs to survive into rawData rather
// than being silently dropped, since storeDarwinboxExits() in storeRaw.ts
// persists exactly this mapped row object, not the original raw record.
const ALIASES: Record<string, string[]> = {
  "Employee Id": ["Employee Id", "employee_id", "emp_id", "employeeId", "employee_code", "id"],
  "Full Name": ["Employee Name", "full_name", "employee_name", "name", "fullName"],
  "Exit Date": ["Date Of Resignation", "Separation Requested On", "exit_date", "date_of_exit", "last_working_day", "lwd", "relieving_date", "separation_date", "exitDate"],
  "Reason": ["Separation Type", "reason", "exit_reason", "separation_reason", "reason_for_leaving"],
  "Status": ["Status", "status"],
};

function firstPresent(record: Record<string, unknown>, aliases: string[]): unknown {
  const lowerMap = new Map(Object.keys(record).map((k) => [k.toLowerCase(), record[k]]));
  for (const alias of aliases) {
    if (alias in record) return record[alias];
    const hit = lowerMap.get(alias.toLowerCase());
    if (hit !== undefined) return hit;
  }
  return null;
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

// Same Report Builder endpoint/credentials as the base exit report, just a
// different report id — reused for both the base report and each
// enrichment report below (fetchEnrichmentRecords).
async function fetchRaw(reportId: string, timeoutMs = 30000): Promise<unknown> {
  const missingKeys = missing(REQUIRED);
  if (missingKeys.length) {
    throw new DarwinboxExitsError(`Darwinbox exits-report credentials are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
  }
  const body = {
    api_key: config.DBX_CHECK_API_KEY,
    report_id: reportId,
    reportId: reportId,
    id: reportId,
  };

  try {
    return await runWithHardTimeout(async () => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(config.DBX_CHECK_ENDPOINT!, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: basicAuthHeader(config.DBX_CHECK_USERNAME!, config.DBX_CHECK_PASSWORD!) },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new DarwinboxExitsError(`Darwinbox reports API returned HTTP ${resp.status}: ${text.slice(0, 500)}`);
        }
        return await resp.json();
      } finally {
        clearTimeout(t);
      }
    }, timeoutMs + 5000);
  } catch (e) {
    if (e instanceof HardTimeout) throw new DarwinboxExitsError(e.message);
    if (e instanceof DarwinboxExitsError) throw e;
    throw new DarwinboxExitsError(`Could not reach the Darwinbox reports endpoint: ${(e as Error).message}`);
  }
}

// Keys tried, in order, at each nesting level while hunting for the actual
// records array. Confirmed live on 2026-08-26: the real envelope is
// { response, code, status } — the array lives under "response" (possibly
// nested one level deeper still, hence the recursive search below rather
// than a flat one-level check).
const NESTED_ARRAY_KEYS = ["response", "data", "report_data", "reportData", "records", "result", "rows", "list", "items", "report", "details"];

function findRecordsArray(value: unknown, depth = 0): Record<string, unknown>[] | null {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (depth < 3 && value && typeof value === "object") {
    for (const key of NESTED_ARRAY_KEYS) {
      const val = (value as Record<string, unknown>)[key];
      if (val !== undefined && val !== null) {
        const found = findRecordsArray(val, depth + 1);
        if (found) return found;
      }
    }
  }
  return null;
}

export async function fetchExitRecords(): Promise<Record<string, unknown>[]> {
  const raw = await fetchRaw(config.DBX_CHECK_REPORT_ID!);
  const found = findRecordsArray(raw);
  if (found) return found;
  throw new DarwinboxExitsError(
    `Unrecognized response shape — could not find a records array searching keys [${NESTED_ARRAY_KEYS.join(", ")}] up to 3 levels deep. Raw response (truncated to 3000 chars): ${JSON.stringify(raw).slice(0, 3000)}`
  );
}

// --- Enrichment reports (2026-09-19, per request) --------------------------
//
// The base report above only ever returns 5 fields. To get "full exit
// details" for each employee_id, we separately call the same Report Builder
// endpoint once per id in DBX_CHECK_ENRICH_REPORT_IDS (config.ts) and join
// each report's rows onto the matching base exit row by Employee Id. These
// extra reports' shapes are NOT known ahead of time the way the base
// report's are (no confirmed field list yet — see the 2026-08-26 note atop
// this file for how that was pinned down), so unlike the base report we do
// NOT force every field through the fixed ALIASES map: whatever field names
// a given report actually returns are merged onto the row as-is, and the
// full-details page (see reports.ts's GET /reports/darwin-exit-details)
// renders whatever columns show up, the same "don't hardcode the shape"
// approach darwin-full-roster.tsx already uses for the full company roster.

function parseEnrichReportIds(): string[] {
  return (config.DBX_CHECK_ENRICH_REPORT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function employeeIdKey(record: Record<string, unknown>): string | null {
  const value = firstPresent(record, ALIASES["Employee Id"]);
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

async function fetchEnrichmentRecords(reportId: string): Promise<Record<string, unknown>[]> {
  const raw = await fetchRaw(reportId);
  return findRecordsArray(raw) ?? [];
}

// Merges one enrichment report's fields onto each base row that shares its
// Employee Id, skipping the report's own employee-id column (the base row
// already has the canonical "Employee Id") and never overwriting a field
// the base row (or an earlier, higher-priority enrichment report) already
// filled in -- "first non-blank value wins", same rule the report-priority
// order documented in config.ts describes.
function mergeEnrichmentFields(rows: SheetRow[], enrichmentRecords: Record<string, unknown>[]): void {
  if (!enrichmentRecords.length) return;
  const byEmployeeId = new Map<string, Record<string, unknown>>();
  for (const record of enrichmentRecords) {
    const key = employeeIdKey(record);
    if (key && !byEmployeeId.has(key)) byEmployeeId.set(key, record);
  }
  const employeeIdAliasSet = new Set(ALIASES["Employee Id"].map((a) => a.toLowerCase()));
  for (const row of rows) {
    const rowKey = row["Employee Id"] === null || row["Employee Id"] === undefined ? null : String(row["Employee Id"]).trim().toLowerCase();
    if (!rowKey) continue;
    const enrichmentRecord = byEmployeeId.get(rowKey);
    if (!enrichmentRecord) continue;
    for (const [field, value] of Object.entries(enrichmentRecord)) {
      if (employeeIdAliasSet.has(field.trim().toLowerCase())) continue;
      const existing = row[field];
      const isBlank = existing === null || existing === undefined || existing === "";
      const hasValue = value !== null && value !== undefined && value !== "";
      if (isBlank && hasValue) row[field] = value;
    }
  }
}

/**
 * Fetches + maps to the "Full Name" / "Employee Id" / "Exit Date" / "Reason"
 * shape reconcileExits() expects, then joins in every DBX_CHECK_ENRICH_REPORT_IDS
 * report by Employee Id so each row carries whatever additional detail
 * those reports have on file, not just the base report's 5 fields.
 */
export async function fetchExitRows(): Promise<SheetRow[]> {
  const records = await fetchExitRecords();
  const rows = records.map((rec) => {
    const row: SheetRow = {};
    for (const [canonical, aliases] of Object.entries(ALIASES)) row[canonical] = firstPresent(rec, aliases);
    return row;
  });
  if (rows.length && rows.every((r) => r["Employee Id"] == null) && rows.every((r) => r["Full Name"] == null)) {
    const seen = new Set<string>();
    records.forEach((r) => Object.keys(r).forEach((k) => seen.add(k)));
    throw new DarwinboxExitsError(
      `Could not map Employee Id or Full Name from any record. Raw fields available: ${[...seen].sort().join(", ")}. Update ALIASES in darwinboxExits.ts.`
    );
  }

  // Enrichment is best-effort: one bad/renamed/inaccessible report id
  // shouldn't take down the whole exits sync (the base report above is what
  // actually drives exitFlag/exitFlagStatus). Log and move on to the next
  // report rather than throwing.
  for (const reportId of parseEnrichReportIds()) {
    try {
      const enrichmentRecords = await fetchEnrichmentRecords(reportId);
      mergeEnrichmentFields(rows, enrichmentRecords);
    } catch (e) {
      console.warn(`[darwinboxExits] Enrichment report ${reportId} failed, skipping it: ${(e as Error).message}`);
    }
  }

  return rows;
}

/** Run for schema inspection: `npx tsx src/lib/connectors/darwinboxExits.ts` (with .env loaded). */
export async function inspectDarwinboxExits() {
  const records = await fetchExitRecords();
  console.log(`Found ${records.length} exit records.`);
  if (records[0]) {
    console.log("First record's keys:", Object.keys(records[0]));
    console.log(JSON.stringify(records[0], null, 2).slice(0, 2000));
  }
  for (const reportId of parseEnrichReportIds()) {
    try {
      const enrichmentRecords = await fetchEnrichmentRecords(reportId);
      console.log(`Enrichment report ${reportId}: found ${enrichmentRecords.length} records.`);
      if (enrichmentRecords[0]) console.log(`  First record's keys:`, Object.keys(enrichmentRecords[0]));
    } catch (e) {
      console.log(`Enrichment report ${reportId} failed: ${(e as Error).message}`);
    }
  }
  const rows = await fetchExitRows();
  console.log("Mapped + enriched first row:", rows[0]);
}
