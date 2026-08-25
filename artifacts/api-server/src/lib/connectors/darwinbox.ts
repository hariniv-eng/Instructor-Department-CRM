// Client for Darwinbox's Master API (masterapi/employee) — the active
// employee roster ("Darwin" data). Auth: HTTP Basic Auth + api_key/
// datasetKey in the JSON body (Darwinbox's documented request shape).
//
// Field names in the real response haven't been confirmed from in here (no
// outbound network access in the sandbox this was built in) — run this
// module's `inspectDarwinbox()` once you have real network access (see
// LIVE_SYNC.md) and adjust ALIASES below if names differ.

import { config, missing } from "./config";
import { runWithHardTimeout, HardTimeout } from "./timeout";
import type { SheetRow } from "../reconcile";

export class DarwinboxError extends Error {}

const REQUIRED = ["DARWINBOX_ENDPOINT", "DARWINBOX_USERNAME", "DARWINBOX_PASSWORD", "DARWINBOX_API_KEY", "DARWINBOX_DATASET_KEY"] as const;

// Canonical column -> plausible raw-field aliases. Once you've seen a real
// response, move the confirmed field name to the front of its list.
const ALIASES: Record<string, string[]> = {
  "Employee Id": ["employee_id", "emp_id", "employeeId", "employee_code", "id"],
  "Full Name": ["full_name", "employee_name", "name", "fullName"],
  "Org Email Id": ["official_email", "email", "org_email", "work_email", "emailId"],
  "Primary Mobile Number": ["mobile_number", "contact_number", "mobile", "phone", "phone_number"],
  "Date Of Joining": ["date_of_joining", "doj", "joining_date", "dateOfJoining"],
  "Department": ["department", "dept"],
  "Sub Department": ["sub_department", "subDepartment", "sub_dept"],
  "Designation": ["designation", "designation_name"],
  "Direct Manager": ["reporting_manager", "manager_name", "direct_manager", "reportingManager"],
  "Work Location": ["work_location", "location", "workLocation"],
  "Workspace": ["workspace", "office", "seating_location"],
  "Gender": ["gender"],
  "Employee Status": ["employee_status", "status", "employment_status"],
  "Current State": ["state", "current_state"],
  "Current City": ["city", "current_city"],
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
    throw new DarwinboxError(`Darwinbox credentials are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
  }
  const body = { api_key: config.DARWINBOX_API_KEY, datasetKey: config.DARWINBOX_DATASET_KEY };

  try {
    return await runWithHardTimeout(async () => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const resp = await fetch(config.DARWINBOX_ENDPOINT!, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: basicAuthHeader(config.DARWINBOX_USERNAME!, config.DARWINBOX_PASSWORD!) },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new DarwinboxError(`Darwinbox API returned HTTP ${resp.status}: ${text.slice(0, 500)}`);
        }
        return await resp.json();
      } finally {
        clearTimeout(t);
      }
    }, timeoutMs + 5000);
  } catch (e) {
    if (e instanceof HardTimeout) throw new DarwinboxError(e.message);
    if (e instanceof DarwinboxError) throw e;
    throw new DarwinboxError(`Could not reach Darwinbox endpoint: ${(e as Error).message}`);
  }
}

export async function fetchEmployeeRecords(): Promise<Record<string, unknown>[]> {
  const raw = await fetchRaw();
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    for (const key of ["employee_data", "data", "employees", "records"]) {
      const val = (raw as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as Record<string, unknown>[];
    }
  }
  throw new DarwinboxError(
    `Unrecognized Darwinbox response shape — top-level keys: ${raw && typeof raw === "object" ? Object.keys(raw).join(", ") : typeof raw}. Adjust fetchEmployeeRecords() in darwinbox.ts.`
  );
}

/** Fetches + maps to the same "Full Name" / "Employee Id" / ... row shape reconcileDarwin() already expects from CSV uploads. */
export async function fetchDarwinRows(): Promise<SheetRow[]> {
  const records = await fetchEmployeeRecords();
  const rows = records.map((rec) => {
    const row: SheetRow = {};
    for (const [canonical, aliases] of Object.entries(ALIASES)) row[canonical] = firstPresent(rec, aliases);
    return row;
  });
  if (rows.length) {
    const missingCanonical = Object.keys(ALIASES).filter((c) => rows.every((r) => r[c] == null));
    if (missingCanonical.length) {
      const seen = new Set<string>();
      records.forEach((r) => Object.keys(r).forEach((k) => seen.add(k)));
      throw new DarwinboxError(
        `Could not map any values for: ${missingCanonical.join(", ")}. Raw fields available: ${[...seen].sort().join(", ")}. Update ALIASES in darwinbox.ts.`
      );
    }
  }
  return rows;
}

/** Run for schema inspection: `npx tsx src/lib/connectors/darwinbox.ts` (with .env loaded). */
export async function inspectDarwinbox() {
  const raw = await fetchRaw();
  console.log("Raw top-level shape:", Array.isArray(raw) ? `array (${raw.length} items)` : Object.keys(raw as object));
  const records = await fetchEmployeeRecords();
  console.log(`Found ${records.length} employee records.`);
  if (records[0]) {
    console.log("First record's keys:", Object.keys(records[0]));
    console.log(JSON.stringify(records[0], null, 2).slice(0, 2000));
  }
  const rows = await fetchDarwinRows();
  console.log("Mapped first row:", rows[0]);
}
