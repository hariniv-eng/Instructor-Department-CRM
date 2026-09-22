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
// "Employee Id" carries extra aliases beyond what the base report needs
// (2026-09-19, per request -- enrichment reports weren't joining, and the
// suspicion is a report using a employee-id column name of its own that
// wasn't recognized here, silently producing zero matches for that whole
// report). These are common Darwinbox Report Builder column-name variants
// for the same concept, not the base report's own confirmed field --
// inspectDarwinboxExits() below reports exactly which ones (if any) each
// enrichment report actually matched against, add more here if a real
// report turns up something not on this list.
const ALIASES: Record<string, string[]> = {
  "Employee Id": [
    "Employee Id", "employee_id", "emp_id", "employeeId", "employee_code", "id",
    "Emp ID", "Emp Id", "EmpId", "EmpID", "Emp Code", "Employee Code", "Employee No",
    "Employee Number", "Employee No.", "EmployeeNo", "Emp No", "Emp No.", "EmpNo",
    "Personnel Number", "Personnel No", "Staff ID", "Staff Id", "StaffId",
  ],
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

// Unlike fetchExitRecords() (the base report), this used to swallow an
// unrecognized response shape into a plain empty array instead of throwing
// -- meaning a permission error, an "invalid report id" message, or any
// other error-shaped response Darwinbox sent back for one of these ids
// looked EXACTLY like "this report has zero exit records", with nothing
// logged anywhere (2026-09-19 fix, per request: enrichment was still
// producing 0 extra columns with no warning at all in the logs -- this is
// why). Now it throws with the raw response included, same as the base
// report, so the catch in fetchExitRows()/inspectDarwinboxExits() actually
// surfaces what Darwinbox said.
async function fetchEnrichmentRecords(reportId: string): Promise<Record<string, unknown>[]> {
  const raw = await fetchRaw(reportId);
  const found = findRecordsArray(raw);
  if (found) return found;
  throw new DarwinboxExitsError(
    `Unrecognized response shape for enrichment report ${reportId} — could not find a records array. Raw response (truncated to 1500 chars): ${JSON.stringify(raw).slice(0, 1500)}`
  );
}

// Merges one enrichment report's fields onto each base row that shares its
// Employee Id, skipping the report's own employee-id column (the base row
// already has the canonical "Employee Id") and never overwriting a field
// the base row (or an earlier, higher-priority enrichment report) already
// filled in -- "first non-blank value wins", same rule the report-priority
// order documented in config.ts describes.
//
// A report can carry MORE THAN ONE row for the same Employee Id (2026-09-19
// fix, per request: "still we didn't get the complete exit data, we have
// multiple more rows" -- someone had several rows in one of these reports,
// e.g. one line per training/offboarding-step/job-history entry, each with
// only some columns filled in, and comparing directly against Darwinbox's
// own report showed fields the app was missing). Grouping by Employee Id
// (rather than keeping only the first row found for that id, which is what
// this used to do) and merging every one of that employee's rows in turn
// means a field left blank on their first row can still get filled from
// their second, third, etc. -- still first-non-blank-wins, just across ALL
// of that employee's rows in this report, not only the earliest one.
type MergeStats = {
  totalRecords: number;
  recordsWithNoEmployeeId: number;
  rowsMatched: number;
};

function mergeEnrichmentFields(rows: SheetRow[], enrichmentRecords: Record<string, unknown>[]): MergeStats {
  const stats: MergeStats = { totalRecords: enrichmentRecords.length, recordsWithNoEmployeeId: 0, rowsMatched: 0 };
  if (!enrichmentRecords.length) return stats;
  const recordsByEmployeeId = new Map<string, Record<string, unknown>[]>();
  for (const record of enrichmentRecords) {
    const key = employeeIdKey(record);
    if (!key) {
      stats.recordsWithNoEmployeeId += 1;
      continue;
    }
    const bucket = recordsByEmployeeId.get(key);
    if (bucket) bucket.push(record);
    else recordsByEmployeeId.set(key, [record]);
  }
  const employeeIdAliasSet = new Set(ALIASES["Employee Id"].map((a) => a.toLowerCase()));
  for (const row of rows) {
    const rowKey = row["Employee Id"] === null || row["Employee Id"] === undefined ? null : String(row["Employee Id"]).trim().toLowerCase();
    if (!rowKey) continue;
    const matchingRecords = recordsByEmployeeId.get(rowKey);
    if (!matchingRecords) continue;
    stats.rowsMatched += 1;
    for (const enrichmentRecord of matchingRecords) {
      for (const [field, value] of Object.entries(enrichmentRecord)) {
        if (employeeIdAliasSet.has(field.trim().toLowerCase())) continue;
        const existing = row[field];
        const isBlank = existing === null || existing === undefined || existing === "";
        const hasValue = value !== null && value !== undefined && value !== "";
        if (isBlank && hasValue) row[field] = value;
      }
    }
  }
  return stats;
}

/**
 * Fetches + maps to the "Full Name" / "Employee Id" / "Exit Date" / "Reason"
 * shape reconcileExits() expects, then joins in every DBX_CHECK_ENRICH_REPORT_IDS
 * report by Employee Id so each row carries whatever additional detail
 * those reports have on file, not just the base report's 5 fields.
 */
export async function fetchExitRows(): Promise<SheetRow[]> {
  const records = await fetchExitRecords();
  // All alias strings across ALIASES, lowercased -- a raw field matching one
  // of these is already captured under its canonical name below, so it's
  // skipped when copying the record's remaining fields over.
  const claimedAliases = new Set(Object.values(ALIASES).flat().map((a) => a.toLowerCase()));
  const rows = records.map((rec) => {
    const row: SheetRow = {};
    for (const [canonical, aliases] of Object.entries(ALIASES)) row[canonical] = firstPresent(rec, aliases);
    // The base report was originally confirmed to return only the 5
    // canonical fields above (2026-08-26 note atop this file), but if it
    // ever carries more columns than that -- e.g. this report gets extra
    // columns added on the Darwinbox side later -- they used to be silently
    // dropped here instead of surfacing anywhere. Copy anything else the
    // record has straight through, same "don't hardcode the shape" approach
    // the enrichment merge below and darwin-full-roster.tsx already use.
    for (const [field, value] of Object.entries(rec)) {
      if (claimedAliases.has(field.trim().toLowerCase())) continue;
      if (row[field] === undefined) row[field] = value;
    }
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
      const stats = mergeEnrichmentFields(rows, enrichmentRecords);
      if (stats.totalRecords === 0) {
        // Fetched fine (didn't throw) but the report itself has zero rows
        // right now -- logged unconditionally so this never looks identical
        // to the "failed" or "fetched but didn't join" cases below.
        console.warn(`[darwinboxExits] Enrichment report ${reportId} returned 0 records -- nothing to merge from it this sync.`);
      } else if (stats.rowsMatched === 0) {
        // Fetched fine but joined onto nothing -- almost always means this
        // report's employee-id column isn't one of ALIASES["Employee Id"]'s
        // aliases. Loud on purpose: this fails silently otherwise (the sync
        // "succeeds" with rows just missing that report's fields).
        console.warn(`[darwinboxExits] Enrichment report ${reportId} returned ${stats.totalRecords} record(s) but matched 0 exit rows by Employee Id -- its employee-id column probably isn't recognized. Run 'pnpm --filter @workspace/api-server run inspect:darwinbox-exits' to see its actual field names and add the right one to ALIASES in darwinboxExits.ts.`);
      } else {
        console.log(`[darwinboxExits] Enrichment report ${reportId}: ${stats.totalRecords} record(s), matched ${stats.rowsMatched} exit row(s)${stats.recordsWithNoEmployeeId ? `, ${stats.recordsWithNoEmployeeId} record(s) had no recognizable Employee Id` : ""}.`);
      }
    } catch (e) {
      console.warn(`[darwinboxExits] Enrichment report ${reportId} failed, skipping it: ${(e as Error).message}`);
    }
  }

  return rows;
}

// Targeted check (2026-09-22, per request: "not just 5 fields i also need
// the data that we have in the other reports also") -- for a specific,
// named list of employee_ids, checks the base exit report AND every
// configured enrichment report individually and prints exactly what row (if
// any) exists for each one in each report. This is the exhaustive version
// of what mergeEnrichmentFields() already does automatically on every sync
// (and what darwinbox_exits.raw_data already reflects, since the sync
// stores the merged row) -- but it prints per-report, per-employee detail
// instead of just aggregate counts, so there's no ambiguity about whether
// "no data" means "none of the 4 reports have this person" versus "only
// checked one report." Run via:
//   npx tsx src/lib/connectors/inspect.ts darwinbox-exits-for NW0004155,NW0004563,...
// CSV field quoting -- wraps in double quotes and escapes embedded quotes
// whenever the value contains a comma, quote, or newline. Plain values are
// left bare, matching how psql --csv (used throughout this investigation)
// formats output, so the two are easy to compare side by side.
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Tidy/long-format row: one row per field found for an employee in a given
// report, so the CSV never assumes a fixed schema (every report here has
// a different, unpredictable set of columns -- see the report field lists
// printed by inspectDarwinboxExits()). A row with an empty "field"/"value"
// and value "NOT FOUND" marks an employee that report has no record for.
function csvRow(employeeId: string, report: string, field: string, value: unknown): string {
  return [csvField(employeeId), csvField(report), csvField(field), csvField(value)].join(",");
}

export async function inspectExitDataForEmployees(employeeIds: string[]) {
  const targets = new Set(employeeIds.map((id) => id.trim().toLowerCase()).filter(Boolean));
  if (!targets.size) {
    console.log("No employee_ids given.");
    return;
  }
  console.error(`Checking ${targets.size} employee_id(s) against the base exit report and all configured enrichment reports.`);
  console.error(`CSV rows are printed to stdout below (between the CSV_START/CSV_END markers) -- everything else here goes to stderr so you can separate them, e.g. redirect stdout to a file.\n`);

  const REPORT_NAMES: Record<string, string> = {
    "70c916bd0ed8bb": "EIF Main",
    "1d513a4ccdf2e8": "TA Employee Master",
    "9feb118d44726a": "Offboarding tracking",
    "853905cf311922": "L&D Details",
  };

  console.log("CSV_START");
  console.log(csvRow("employee_id", "report", "field", "value")); // header

  const baseRecords = await fetchExitRecords();
  console.error(`--- Base report (${config.DBX_CHECK_REPORT_ID}): ${baseRecords.length} records total ---`);
  const seenInBase = new Set<string>();
  for (const record of baseRecords) {
    const key = employeeIdKey(record);
    if (key && targets.has(key)) {
      seenInBase.add(key);
      for (const [field, value] of Object.entries(record)) {
        console.log(csvRow(key.toUpperCase(), "Base exit report", field, value));
      }
    }
  }
  for (const target of targets) {
    if (!seenInBase.has(target)) console.log(csvRow(target.toUpperCase(), "Base exit report", "", "NOT FOUND"));
  }

  for (const reportId of parseEnrichReportIds()) {
    const reportName = REPORT_NAMES[reportId] ?? reportId;
    console.error(`\n--- Enrichment report ${reportId} (${reportName}) ---`);
    try {
      const records = await fetchEnrichmentRecords(reportId);
      const seenInReport = new Set<string>();
      for (const record of records) {
        const key = employeeIdKey(record);
        if (key && targets.has(key)) {
          seenInReport.add(key);
          for (const [field, value] of Object.entries(record)) {
            console.log(csvRow(key.toUpperCase(), reportName, field, value));
          }
        }
      }
      console.error(`  ${records.length} records total in this report; ${seenInReport.size} of the ${targets.size} target employee_id(s) found in it.`);
      for (const target of targets) {
        if (!seenInReport.has(target)) console.log(csvRow(target.toUpperCase(), reportName, "", "NOT FOUND"));
      }
    } catch (e) {
      console.error(`  Report failed, could not check: ${(e as Error).message}`);
      for (const target of targets) {
        console.log(csvRow(target.toUpperCase(), reportName, "", "REPORT FAILED"));
      }
    }
  }
  console.log("CSV_END");
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
      if (enrichmentRecords[0]) {
        console.log(`  First record's keys:`, Object.keys(enrichmentRecords[0]));
        const key = employeeIdKey(enrichmentRecords[0]);
        console.log(key
          ? `  Recognized Employee Id on first record: "${key}" -- this report should join correctly.`
          : `  Could NOT find a recognizable Employee Id field on the first record among the keys above. This report will join onto NOTHING until one of its columns is added to ALIASES["Employee Id"] in darwinboxExits.ts.`);
        const matchedCount = enrichmentRecords.filter((r) => employeeIdKey(r) !== null).length;
        console.log(`  ${matchedCount} of ${enrichmentRecords.length} records have a recognizable Employee Id.`);
      }
    } catch (e) {
      console.log(`Enrichment report ${reportId} failed: ${(e as Error).message}`);
    }
  }
  const rows = await fetchExitRows();
  console.log("Mapped + enriched first row:", rows[0]);
  console.log("Mapped + enriched first row's field count:", Object.keys(rows[0] ?? {}).length);
}
