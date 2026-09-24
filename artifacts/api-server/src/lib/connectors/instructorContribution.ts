// Discovery-only client for the "Contribution data" BigQuery table
// (2026-09-24, per request -- "the contribution table
// niat_instructor_session_schedule_details" / "try accessing it from
// teachOS big query"). This replaces the manual sheet Ankush previously
// uploaded for instructor contribution tracking -- the goal is to pull the
// same data straight from BigQuery instead, same as every other TeachOS
// source this app already syncs.
//
// Lives in the SAME BigQuery project/dataset as bigquery.ts (roster) and
// instructorLearningStatus.ts (learning status) -- config.BIGQUERY_PROJECT_ID
// / config.BIGQUERY_DATASET, just a different table name. No schema is
// confirmed yet: this file is discovery-only (getSchema/getRowCount/
// fetchSampleRows/checkDistinctValues + inspectSessionScheduleDetails), same
// first step as every other live table added to this app -- see
// inspect:instructor-unit-completion's header comment in
// instructorLearningStatus.ts for why (never guess a column mapping before
// seeing the real schema + sample rows).
//
// Run: `pnpm --filter @workspace/api-server run inspect:instructor-session-schedule`
// (needs real network access to BigQuery -- works on Replit or any
// deployment with .env/Secrets configured, not in this sandbox).

import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout, HardTimeout } from "./timeout";

export class InstructorContributionError extends Error {}

const REQUIRED = ["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET"] as const;
const API_TIMEOUT_MS = 30000;

// Overridable the same way UNIT_COMPLETION_TABLE/PRACTICE_EXAM_TABLE are in
// instructorLearningStatus.ts, in case the real table is ever renamed.
export const SESSION_SCHEDULE_TABLE =
  process.env.INSTRUCTOR_SESSION_SCHEDULE_TABLE || "niat_instructor_session_schedule_details";

function assertConfigured() {
  const missingKeys = missing(REQUIRED);
  if (missingKeys.length) {
    throw new InstructorContributionError(
      `BigQuery settings are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`
    );
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
        throw new InstructorContributionError(`GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ${(e as Error).message}`);
      }
      return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials });
    }
    return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  } catch (e) {
    if (e instanceof InstructorContributionError) throw e;
    throw new InstructorContributionError(`Could not create BigQuery client: ${(e as Error).message}`);
  }
}

function tableRef(tableName: string): string {
  return `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${tableName}`;
}

/** Reads a table's column names/types via its metadata — no query needed, works even on an empty table. */
export async function getSchema(tableName: string): Promise<Array<[string, string]>> {
  const bq = client();
  const ref = tableRef(tableName);
  try {
    const [metadata] = await runWithHardTimeout(
      () => bq.dataset(config.BIGQUERY_DATASET!).table(tableName).getMetadata(),
      API_TIMEOUT_MS + 10000
    );
    return (metadata.schema?.fields ?? []).map((f: { name: string; type: string }) => [f.name, f.type]);
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorContributionError(`Could not read table ${ref}: ${e.message}`);
    throw new InstructorContributionError(`Could not read table ${ref}: ${(e as Error).message}`);
  }
}

/** Total row count for the table — cheap sanity check alongside the sample rows. */
export async function getRowCount(tableName: string): Promise<number> {
  const bq = client();
  const ref = tableRef(tableName);
  const query = `SELECT COUNT(*) AS row_count FROM \`${ref}\``;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    return Number((rows as Array<{ row_count: number }>)[0]?.row_count ?? 0);
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorContributionError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorContributionError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

/** Grabs a handful of raw rows as-is (no column mapping, since real names are unknown yet) to see actual values, not just types. */
export async function fetchSampleRows(tableName: string, limit = 10): Promise<Record<string, unknown>[]> {
  const bq = client();
  const ref = tableRef(tableName);
  const query = `SELECT * FROM \`${ref}\` LIMIT ${limit}`;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    return rows as Record<string, unknown>[];
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorContributionError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorContributionError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

/** Distinct values of a column + row count per value — same purpose as checkDistinctValues() in bigquery.ts / instructorLearningStatus.ts. */
export async function checkDistinctValues(tableName: string, column: string): Promise<void> {
  const bq = client();
  const ref = tableRef(tableName);
  const schemaFields = new Set((await getSchema(tableName)).map(([name]) => name));
  if (!schemaFields.has(column)) {
    throw new InstructorContributionError(`Table ${ref} has no column "${column}". Actual columns: ${[...schemaFields].sort().join(", ")}.`);
  }
  const query = `SELECT ${column}, COUNT(*) AS row_count FROM \`${ref}\` GROUP BY ${column} ORDER BY row_count DESC`;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    console.log(`Distinct values of "${column}" in ${ref}:`);
    for (const row of rows as Record<string, unknown>[]) {
      console.log(`  ${JSON.stringify(row[column])} — ${row["row_count"]} rows`);
    }
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorContributionError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorContributionError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

async function inspectTable(tableName: string): Promise<void> {
  const ref = tableRef(tableName);
  console.log(`Table: ${ref}`);
  const schema = await getSchema(tableName);
  console.log(`${schema.length} columns:`);
  schema.forEach(([name, type]) => console.log(`  - ${name} (${type})`));
  const rowCount = await getRowCount(tableName);
  console.log(`\nTotal rows: ${rowCount.toLocaleString()}`);
  const rows = await fetchSampleRows(tableName, 10);
  console.log(`\nFirst ${rows.length} sample rows:`);
  console.log(rows);
}

/** Run: `npx tsx src/lib/connectors/inspect.ts instructor-session-schedule` (with .env loaded, or live on Replit). */
export async function inspectSessionScheduleDetails(): Promise<void> {
  await inspectTable(SESSION_SCHEDULE_TABLE);
}
