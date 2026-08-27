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

async function fetchRaw(timeoutMs = 30000): Promise<unknown> {
  const missingKeys = missing(REQUIRED);
  if (missingKeys.length) {
    throw new DarwinboxExitsError(`Darwinbox exits-report credentials are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
  }
  const body = {
    api_key: config.DBX_CHECK_API_KEY,
    report_id: config.DBX_CHECK_REPORT_ID,
    reportId: config.DBX_CHECK_REPORT_ID,
    id: config.DBX_CHECK_REPORT_ID,
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
  const raw = await fetchRaw();
  const found = findRecordsArray(raw);
  if (found) return found;
  throw new DarwinboxExitsError(
    `Unrecognized response shape — could not find a records array searching keys [${NESTED_ARRAY_KEYS.join(", ")}] up to 3 levels deep. Raw response (truncated to 3000 chars): ${JSON.stringify(raw).slice(0, 3000)}`
  );
}

/** Fetches + maps to the "Full Name" / "Employee Id" / "Exit Date" / "Reason" shape reconcileExits() expects. */
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
  const rows = await fetchExitRows();
  console.log("Mapped first row:", rows[0]);
}
