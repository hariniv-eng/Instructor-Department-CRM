// Client for pulling TeachOS instructor-deployment data from BigQuery.
// Uses the official @google-cloud/bigquery client (externalized from the
// esbuild bundle in build.mjs already — @google-cloud/* — so it resolves
// from node_modules at runtime as-is).
//
// The table name (niat_instructor_unit_wise_completion_and_best_attempt_
// details) reads like unit/lesson completion tracking rather than a
// dedicated roster table. Confirmed live on 2026-08-25: it carries
// instructor_user_id / instructor_name / institute_name per row, but has
// no instructor_role / instructor_category / instructor_manager columns.
// See the note above EXPECTED_COLUMNS for how that's handled.

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
// Confirmed against the real table (2026-08-25): this is a lesson/unit
// completion-tracking table, not a dedicated instructor roster. It carries
// instructor_user_id / instructor_name / institute_name per row, but has no
// instructor_role / instructor_category / instructor_manager columns at all.
// Those three are intentionally left out of the query below — reconcileTeachos()
// already resets teachosRole/teachosCategory/teachosManager to null before
// every sync, so synced records simply keep those fields empty until a real
// source for them is wired in (a proper roster table, another API, etc.).
export const EXPECTED_COLUMNS: Record<string, string> = {
  instructor_user_id: "instructor_user_id",
  instructor_name: "instructor_name",
  institute_name: "institute_name",
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
    return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  } catch (e) {
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
