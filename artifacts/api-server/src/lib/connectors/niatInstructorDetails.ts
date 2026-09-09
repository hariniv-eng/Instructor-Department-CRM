// Client for pulling employee-ID mapping data from BigQuery's
// niat_instructor_details table — a separate table from the one
// bigquery.ts's fetchTeachosRows() reads (niat_instructor_managers_and_
// instructors_details, which has no employee ID column at all). This
// table carries nw_instructor_id (the NW-format employee ID) plus
// instructor_user_id, which lines up with the same TeachOS user id
// reconcileTeachosEmployeeIdReference() already matches on. Confirmed
// live via INFORMATION_SCHEMA on 2026-09-01: instructor_user_id,
// institute_id, instructor_category, instructor_name, instructor_role,
// instructor_status, nw_instructor_id, institute_name, institute_type.

import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout, HardTimeout } from "./timeout";
import type { SheetRow } from "../reconcile";

export class NiatInstructorDetailsError extends Error {}

const REQUIRED = ["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET"] as const;
const API_TIMEOUT_MS = 30000;
const TABLE_NAME = process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details";

// Left = canonical name reconcileTeachosEmployeeIdReference() looks up via
// cell(); right = actual BigQuery column name.
const EXPECTED_COLUMNS: Record<string, string> = {
  instructor_user_id: "instructor_user_id",
  employee_id: "nw_instructor_id",
  instructor_name: "instructor_name",
  instructor_status: "instructor_status",
  // Added so a live sync carries the same fields the manually-uploaded
  // niat_instructor_details extracts already do — without these,
  // reconcileTeachos() would silently write null institutes/role/category
  // for every live-synced row (it reads exactly these column names via
  // cell()). instructor_manager is deliberately NOT here — this table has
  // no manager column at all (see reconcile.ts's teachosManager comment).
  institute_name: "institute_name",
  institute_type: "institute_type",
  instructor_category: "instructor_category",
  instructor_role: "instructor_role",
};

function assertConfigured() {
  const missingKeys = missing(REQUIRED);
  if (missingKeys.length) {
    throw new NiatInstructorDetailsError(`BigQuery settings are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
  }
}

function client(): BigQuery {
  assertConfigured();
  try {
    if (config.BIGQUERY_CREDENTIALS_JSON) {
      let credentials: Record<string, unknown>;
      try {
        credentials = JSON.parse(config.BIGQUERY_CREDENTIALS_JSON);
      } catch (e) {
        throw new NiatInstructorDetailsError(`GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ${(e as Error).message}`);
      }
      return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials });
    }
    return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  } catch (e) {
    if (e instanceof NiatInstructorDetailsError) throw e;
    throw new NiatInstructorDetailsError(`Could not create BigQuery client: ${(e as Error).message}`);
  }
}

function tableRef(): string {
  return `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${TABLE_NAME}`;
}

/**
 * Fetches niat_instructor_details rows (employee ID plus the institute/role/
 * category fields reconcileTeachos() needs), mapped to reconcile.ts's
 * expected snake_case keys.
 *
 * Filters on instructor_status = ACTIVE, NOT on employee_id being present
 * (2026-09-09 fix — see TEACHOS_INSTRUCTOR_COUNT_RULES.md / this file's git
 * history for the incident this replaced). The query used to require a
 * non-blank nw_instructor_id instead, which had two bugs at once, both
 * traced to real people going missing from every dashboard report:
 *   1. Any currently-ACTIVE TeachOS instructor with no employee id at all
 *      (e.g. "Dr K Naresh", "Dr Dr Gopinath", and 7 others, mostly at IIT
 *      Kharagpur) was excluded from the sync's input entirely. Since
 *      reconcileTeachos() resets inTeachos=false for EVERYONE at the start
 *      of every run and only sets it back to true for rows present in this
 *      function's result, someone who can never appear here goes
 *      permanently invisible in every report — not a one-off drop, a
 *      standing gap that reproduced on every single sync.
 *   2. The flip side: an instructor who has since gone INACTIVE in TeachOS
 *      but still has an employee id kept coming through here forever (this
 *      query never looked at instructor_status at all), so
 *      reconcileTeachos() kept re-confirming inTeachos=true for them on
 *      every sync — stale inactive people never dropped out, and anyone
 *      never matched to Darwin sat permanently in the Payroll bucket.
 * reconcileTeachos() already matches an employee-id-less row correctly via
 * teachos_user_id / normalized name (see the rowEmployeeId handling there),
 * so nothing downstream needed to change for fix #1 — this query is the
 * only place that needed to stop silently dropping these rows.
 *
 * Note this filter is a query-level optimization (don't even fetch rows we
 * don't want), not the sole guarantee anymore — reconcileTeachos() itself
 * now also checks instructor_status on every row it's handed (2026-09-09),
 * since the manual "TeachOS" CSV upload and the reconcile:from-csv script
 * both feed it rows that never pass through this query at all and need the
 * same protection. recomputeStatuses() still decides
 * active/needs_review/payroll_converted/etc. from whatever ends up in the
 * table — these filters only control who's even a candidate to be
 * inTeachos=true in the first place, matching what "TeachOS active count"
 * is supposed to mean everywhere else in this app.
 */
export async function fetchNiatInstructorDetailsRows(): Promise<SheetRow[]> {
  const bq = client();
  const ref = tableRef();
  const colsSql = Object.entries(EXPECTED_COLUMNS).map(([alias, col]) => `${col} AS ${alias}`).join(", ");
  const query = `SELECT DISTINCT ${colsSql} FROM \`${ref}\` WHERE UPPER(${EXPECTED_COLUMNS.instructor_status}) = 'ACTIVE'`;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    return rows as SheetRow[];
  } catch (e) {
    if (e instanceof HardTimeout) throw new NiatInstructorDetailsError(`Query against ${ref} failed: ${e.message}`);
    throw new NiatInstructorDetailsError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}
