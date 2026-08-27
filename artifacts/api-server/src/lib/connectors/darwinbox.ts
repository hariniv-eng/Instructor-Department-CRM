// Client for Darwinbox's Master API (masterapi/employee) — the active
// employee roster ("Darwin" data). Auth: HTTP Basic Auth + api_key/
// datasetKey in the JSON body (Darwinbox's documented request shape).
//
// Confirmed live on 2026-08-25 against the real Master API (3,327 employee
// records). Real field names are snake_case and listed first in each alias
// list below. There is no "Sub Department" field in the real response at
// all (only "department") — deliberately left unmapped rather than guessed,
// same treatment as the missing TeachOS/BigQuery columns: reconcileDarwin()
// already handles an unmapped canonical column by leaving it null via
// cell()'s normal not-found behavior, so nothing else needs to change for
// that.
import { config, missing } from "./config";
import { runWithHardTimeout, HardTimeout } from "./timeout";
import type { SheetRow } from "../reconcile";

export class DarwinboxError extends Error {}

const REQUIRED = ["DARWINBOX_ENDPOINT", "DARWINBOX_USERNAME", "DARWINBOX_PASSWORD", "DARWINBOX_API_KEY", "DARWINBOX_DATASET_KEY"] as const;

// Canonical column -> plausible raw-field aliases, real name first.
const ALIASES: Record<string, string[]> = {
  "Employee Id": ["employee_id", "emp_id", "employeeId", "employee_code", "id"],
  "Full Name": ["full_name", "employee_name", "name", "fullName"],
  "Org Email Id": ["org_email_id", "official_email", "email", "org_email", "work_email", "emailId"],
  "Primary Mobile Number": ["primary_mobile_number", "mobile_number", "contact_number", "mobile", "phone", "phone_number"],
  "Date Of Joining": ["date_of_joining", "doj", "joining_date", "dateOfJoining"],
  "Department": ["department", "dept"],
  "Designation": ["designation", "designation_name"],
  "Direct Manager": ["direct_manager", "reporting_manager", "manager_name", "reportingManager"],
  "Work Location": ["work_location", "location", "workLocation"],
  "Workspace": ["workspace", "office", "seating_location"],
  "Gender": ["gender"],
  "Employee Status": ["employee_status", "status", "employment_status"],
  "Date Of Exit": ["date_of_exit", "exit_date", "last_working_day"],
  "Current State": ["current_state", "state"],
  "Current City": ["current_city", "city"],
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

// 90s: the Master API returns Darwinbox's entire company roster (~3,300+
// records with many fields) in one response before this file filters it
// down — confirmed on 2026-08-25 that a real fetch can take longer than the
// previous 30s limit some of the time (worked once, then timed out twice in
// a row right after).
async function fetchRaw(timeoutMs = 90000): Promise<unknown> {
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

// The Master API returns Darwinbox's whole company roster (confirmed
// 3,327 records live) — this CRM only tracks the Instructors department,
// so every record is narrowed down to ones whose "department" field starts
// with "Instructors" (matches every instructor sub-department/subject-area
// code, e.g. "Instructors – English & Communication Studies (NWD_ID_E&CS)").
function isInstructorRecord(rec: Record<string, unknown>): boolean {
  const dept = rec["department"];
  return typeof dept === "string" && dept.trim().toLowerCase().startsWith("instructors");
}

export async function fetchEmployeeRecords(): Promise<Record<string, unknown>[]> {
  const raw = await fetchRaw();
  let records: Record<string, unknown>[] | null = null;
  if (Array.isArray(raw)) {
    records = raw as Record<string, unknown>[];
  } else if (raw && typeof raw === "object") {
    for (const key of ["employee_data", "data", "employees", "records"]) {
      const val = (raw as Record<string, unknown>)[key];
      if (Array.isArray(val)) {
        records = val as Record<string, unknown>[];
        break;
      }
    }
  }
  if (!records) {
    throw new DarwinboxError(
      `Unrecognized Darwinbox response shape — top-level keys: ${raw && typeof raw === "object" ? Object.keys(raw).join(", ") : typeof raw}. Adjust fetchEmployeeRecords() in darwinbox.ts.`
    );
  }
  return records.filter(isInstructorRecord);
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
  console.log(`Found ${records.length} Instructors-department employee records (filtered from Darwinbox's full company roster).`);
  if (records[0]) {
    console.log("First record's keys:", Object.keys(records[0]));
    console.log(JSON.stringify(records[0], null, 2).slice(0, 2000));
  }
  const rows = await fetchDarwinRows();
  console.log("Mapped first row:", rows[0]);
}
