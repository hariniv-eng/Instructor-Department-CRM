// Client for pulling TeachOS instructor-deployment data from BigQuery.
// Uses the official @google-cloud/bigquery client (externalized from the
// esbuild bundle in build.mjs already — @google-cloud/* — so it resolves
// from node_modules at runtime as-is).
//
// BIGQUERY_TABLE (.env) points at niat_instructor_managers_and_instructors_
// details as of 2026-08-25 — a dedicated instructor/manager roster table,
// switched from niat_instructor_unit_wise_completion_and_best_attempt_details
// (a lesson/unit completion-tracking table that had no role/category/manager
// columns at all). This roster table has 9 columns confirmed live: identity
// (instructor_user_id, instructor_name, institute_name, instructor_status),
// role/manager (instructor_role, instructor_manager, instructor_manager_
// category, instructor_manager_mail), and instructormanager_id. It has no
// instructor_mail, institute_id, or institute_type — those existed on the
// old completion table but not here.

import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout, HardTimeout } from "./timeout";
import type { SheetRow } from "../reconcile";

export class BigQueryTeachosError extends Error {}

const REQUIRED = ["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET", "BIGQUERY_TABLE"] as const;
const API_TIMEOUT_MS = 30000;

// Left = canonical name used by reconcileTeachos(); right = actual BigQuery
// column name. Adjust the right-hand side once inspectBigQuery() shows you
// the table's real columns.
//
// instructor_category below is intentionally aliased from the source
// column "instructor_manager_category" — reconcileTeachos() (reconcile.ts)
// looks up rows by the literal key "instructor_category" when populating
// teachosCategory, so the alias makes that wiring work without touching
// reconcile.ts. instructor_status and instructormanager_id are pulled
// through but not yet consumed by reconcileTeachos() — add handling there
// if/when this CRM needs to track instructor active/inactive status.
export const EXPECTED_COLUMNS: Record<string, string> = {
  instructor_user_id: "instructor_user_id",
  instructor_name: "instructor_name",
  institute_name: "institute_name",
  instructor_role: "instructor_role",
  instructor_status: "instructor_status",
  instructor_manager: "instructor_manager",
  // Source column is "instructor_manager_category" — aliased to
  // "instructor_category" because reconcileTeachos() (reconcile.ts) already
  // looks up rows by that exact key when populating teachosCategory.
  instructor_category: "instructor_manager_category",
  instructor_manager_mail: "instructor_manager_mail",
  instructormanager_id: "instructormanager_id",
};

function assertConfigured() {
  const missingKeys = missing(REQUIRED);
  if (missingKeys.length) {
    throw new BigQueryTeachosError(`BigQuery settings are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
  }
}

function client(): BigQuery {
  assertConfigured();
  try {
    // Locally this resolves via GOOGLE_APPLICATION_CREDENTIALS pointing at a
    // service-account JSON *file* (see .env / config.ts comment) — that
    // works for local/VS Code dev, but Replit Secrets are plain strings, not
    // files, so there's no way to hand the deployment a file path that
    // actually resolves. GOOGLE_APPLICATION_CREDENTIALS_JSON is the Replit
    // path: paste the *entire contents* of bigquery-service-account.json as
    // one Secret value, and this parses it directly instead of relying on
    // Application Default Credentials to find a file on disk.
    if (config.BIGQUERY_CREDENTIALS_JSON) {
      let credentials: Record<string, unknown>;
      try {
        credentials = JSON.parse(config.BIGQUERY_CREDENTIALS_JSON);
      } catch (e) {
        throw new BigQueryTeachosError(`GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ${(e as Error).message}`);
      }
      return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials });
    }
    return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  } catch (e) {
    if (e instanceof BigQueryTeachosError) throw e;
    throw new BigQueryTeachosError(`Could not create BigQuery client: ${(e as Error).message}`);
  }
}

function tableRef(): string {
  return `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${config.BIGQUERY_TABLE}`;
}

export async function getSchema(): Promise<Array<[string, string]>> {
  const bq = client();
  const ref = tableRef();
  try {
    const [metadata] = await runWithHardTimeout(
      () => bq.dataset(config.BIGQUERY_DATASET!).table(config.BIGQUERY_TABLE!).getMetadata(),
      API_TIMEOUT_MS + 10000
    );
    return (metadata.schema?.fields ?? []).map((f: { name: string; type: string }) => [f.name, f.type]);
  } catch (e) {
    if (e instanceof HardTimeout) throw new BigQueryTeachosError(`Could not read table ${ref}: ${e.message}`);
    throw new BigQueryTeachosError(`Could not read table ${ref}: ${(e as Error).message}`);
  }
}

/** Fetches distinct instructor/institute rows, mapped to reconcileTeachos()'s expected snake_case keys. */
export async function fetchTeachosRows(): Promise<SheetRow[]> {
  const bq = client();
  const ref = tableRef();

  const schemaFields = new Set((await getSchema()).map(([name]) => name));
  const missingCols = Object.values(EXPECTED_COLUMNS).filter((col) => !schemaFields.has(col));
  if (missingCols.length) {
    throw new BigQueryTeachosError(
      `Table ${ref} is missing expected columns: ${missingCols.join(", ")}. Actual columns available: ${[...schemaFields].sort().join(", ")}. Update EXPECTED_COLUMNS in bigquery.ts.`
    );
  }

  const colsSql = Object.entries(EXPECTED_COLUMNS).map(([alias, col]) => `${col} AS ${alias}`).join(", ");
  const query = `SELECT DISTINCT ${colsSql} FROM \`${ref}\``;

  try {
    // No per-call timeout option passed to bq.query() itself — the installed
    // client's types don't accept one here, and runWithHardTimeout below
    // already bounds the whole call externally regardless.
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    return rows as SheetRow[];
  } catch (e) {
    if (e instanceof HardTimeout) throw new BigQueryTeachosError(`Query against ${ref} failed: ${e.message}`);
    throw new BigQueryTeachosError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

/** Prints distinct values of a column + how many rows carry each — used to check what e.g. availability_status actually holds. */
export async function checkDistinctValues(column: string): Promise<void> {
  const bq = client();
  const ref = tableRef();
  const schemaFields = new Set((await getSchema()).map(([name]) => name));
  if (!schemaFields.has(column)) {
    throw new BigQueryTeachosError(`Table ${ref} has no column "${column}". Actual columns: ${[...schemaFields].sort().join(", ")}.`);
  }
  const query = `SELECT ${column}, COUNT(*) AS row_count FROM \`${ref}\` GROUP BY ${column} ORDER BY row_count DESC`;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    console.log(`Distinct values of "${column}" in ${ref}:`);
    for (const row of rows as Record<string, unknown>[]) {
      console.log(`  ${JSON.stringify(row[column])} — ${row["row_count"]} rows`);
    }
  } catch (e) {
    if (e instanceof HardTimeout) throw new BigQueryTeachosError(`Query against ${ref} failed: ${e.message}`);
    throw new BigQueryTeachosError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

/** Run for schema inspection: `npx tsx src/lib/connectors/bigquery.ts` (with .env loaded). */
export async function inspectBigQuery() {
  console.log(`Table: ${tableRef()}`);
  const schema = await getSchema();
  console.log(`${schema.length} columns:`);
  schema.forEach(([name, type]) => console.log(`  - ${name} (${type})`));
  const rows = await fetchTeachosRows();
  console.log(`\nQuery succeeded — ${rows.length} distinct instructor/institute rows.`);
  console.log(rows.slice(0, 10));
}
