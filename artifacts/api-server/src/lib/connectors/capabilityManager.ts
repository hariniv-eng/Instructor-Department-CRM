// Client for pulling Capability Manager assignments from BigQuery's
// niat_instructor_managers_and_instructors_details table -- the OLDER
// TeachOS roster table (see bigquery.ts's header comment for the full
// history). The live TeachOS sync moved to niat_instructor_details
// (niatInstructorDetails.ts) on 2026-09-XX for reliable employee-ID
// matching, but that table carries no instructor_manager column at all, so
// teachosManager has gone unpopulated for anyone synced since. This
// connector re-introduces just the manager assignment as a supplementary
// enrichment pass (see reconcileCapabilityManager() in reconcile.ts) --
// keyed on instructor_user_id, patched onto rows the primary sync already
// matched, never used for primary matching itself.
//
// Table name is independently configurable (CAPABILITY_MANAGER_TABLE) in
// case it's ever renamed, but defaults to the table this was confirmed
// against on 2026-09-07: niat_instructor_managers_and_instructors_details.

import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout, HardTimeout } from "./timeout";
import type { SheetRow } from "../reconcile";

export class CapabilityManagerError extends Error {}

const REQUIRED = ["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET"] as const;
const API_TIMEOUT_MS = 30000;
const TABLE_NAME = process.env.CAPABILITY_MANAGER_TABLE || "niat_instructor_managers_and_instructors_details";

// Left = canonical name reconcileCapabilityManager() looks up via cell();
// right = actual BigQuery column name. instructor_manager_category is
// deliberately not pulled here -- this connector only ever writes
// teachosManager, nothing else.
const EXPECTED_COLUMNS: Record<string, string> = {
  instructor_user_id: "instructor_user_id",
  instructor_manager: "instructor_manager",
};

function assertConfigured() {
  const missingKeys = missing(REQUIRED);
  if (missingKeys.length) {
    throw new CapabilityManagerError(`BigQuery settings are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
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
        throw new CapabilityManagerError(`GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ${(e as Error).message}`);
      }
      return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials });
    }
    return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  } catch (e) {
    if (e instanceof CapabilityManagerError) throw e;
    throw new CapabilityManagerError(`Could not create BigQuery client: ${(e as Error).message}`);
  }
}

function tableRef(): string {
  return `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${TABLE_NAME}`;
}

/** Fetches distinct instructor_user_id -> instructor_manager rows, mapped to reconcile.ts's expected snake_case keys. */
export async function fetchCapabilityManagerRows(): Promise<SheetRow[]> {
  const bq = client();
  const ref = tableRef();
  const colsSql = Object.entries(EXPECTED_COLUMNS).map(([alias, col]) => `${col} AS ${alias}`).join(", ");
  const query = `SELECT DISTINCT ${colsSql} FROM \`${ref}\` WHERE ${EXPECTED_COLUMNS.instructor_manager} IS NOT NULL AND ${EXPECTED_COLUMNS.instructor_manager} != ''`;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    return rows as SheetRow[];
  } catch (e) {
    if (e instanceof HardTimeout) throw new CapabilityManagerError(`Query against ${ref} failed: ${e.message}`);
    throw new CapabilityManagerError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}
