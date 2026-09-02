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

/** Fetches instructor_user_id + nw_instructor_id (employee ID) rows, mapped to reconcileTeachosEmployeeIdReference()'s expected snake_case keys. */
export async function fetchNiatInstructorDetailsRows(): Promise<SheetRow[]> {
  const bq = client();
  const ref = tableRef();
  const colsSql = Object.entries(EXPECTED_COLUMNS).map(([alias, col]) => `${col} AS ${alias}`).join(", ");
  const query = `SELECT DISTINCT ${colsSql} FROM \`${ref}\` WHERE ${EXPECTED_COLUMNS.employee_id} IS NOT NULL AND ${EXPECTED_COLUMNS.employee_id} != ''`;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    return rows as SheetRow[];
  } catch (e) {
    if (e instanceof HardTimeout) throw new NiatInstructorDetailsError(`Query against ${ref} failed: ${e.message}`);
    throw new NiatInstructorDetailsError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}
