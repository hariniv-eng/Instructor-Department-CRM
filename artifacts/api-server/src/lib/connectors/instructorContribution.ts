// Client for the "Contribution data" BigQuery table
// (niat_instructor_session_schedule_details, 2026-09-24, per request --
// "the contribution table niat_instructor_session_schedule_details" / "try
// accessing it from teachOS big query"). This replaces the manual sheet
// Ankush previously uploaded for instructor contribution tracking -- the
// goal is to pull the same data straight from BigQuery instead, same as
// every other TeachOS source this app already syncs.
//
// Lives in the SAME BigQuery project/dataset as bigquery.ts (roster) and
// instructorLearningStatus.ts (learning status) -- config.BIGQUERY_PROJECT_ID
// / config.BIGQUERY_DATASET, just a different table name.
//
// Real schema confirmed 2026-09-24 (via inspect:instructor-session-schedule,
// run on Replit): 39 columns, 237,919 rows, kossip-helpers.niat_instructor_
// automation_data.niat_instructor_session_schedule_details. Key ones used
// by fetchContributionRows() below: instructor_user_id, session_status
// ('COMPLETED' | 'PENDING' | ... -- only COMPLETED counts as "worked"),
// session_type ('LECTURE' | 'PRACTICE' | 'EXAM' | ...), and
// session_duration_in_mins_from_schedule_time. Note: the sample rows also
// showed an `nw_instructor_id` field that the schema metadata call didn't
// list among the 39 -- harmless for the aggregation query below (SELECT *
// isn't used there), but worth knowing about if a future query needs it.
//
// Population/metric choices (2026-09-24, confirmed via AskUserQuestion +
// follow-up): "Hours/time taught" + "Session type breakdown", all-time
// totals, covering both Instructors and Mentors ("create a new tab for
// employee contribution, where we have data of instructors as well mentor
// data there") -- see the Contribution tab (routes/reports.ts's
// /reports/instructor-contribution, same population as Training Stats).
//
// getSchema/getRowCount/fetchSampleRows/checkDistinctValues +
// inspectSessionScheduleDetails below remain for future discovery (e.g. if
// session_type ever needs a fourth bucket confirmed against real data).

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

export type ContributionRow = {
  instructor_user_id: string;
  lecture_minutes: number;
  practice_minutes: number;
  other_minutes: number;
  sessions_completed: number;
};

/**
 * Aggregates niat_instructor_session_schedule_details per instructor_user_id
 * -- one row per instructor comes back, not per raw session (237,919 rows
 * worth), same "aggregate in BigQuery, not in Node" approach
 * fetchCourseStatusRows() uses in instructorLearningStatus.ts.
 *
 * Only session_status = 'COMPLETED' rows count -- a PENDING/scheduled
 * session hasn't actually happened yet, so it isn't "hours worked" (2026-
 * 09-24, per request: "Hours/time taught").
 *
 * Minutes are summed from session_duration_in_mins_from_schedule_time (the
 * actual scheduled window, computed live from session_start_datetime/
 * session_end_datetime), NOT the table's separate session_duration column --
 * sample rows showed session_duration returning a flat 60 even for sessions
 * whose real scheduled window was 10, 15, or 30 minutes, which looks like a
 * nominal/default value rather than the real duration. Flagged to Ankush;
 * easy to swap if that turns out to be wrong.
 *
 * lecture_minutes / practice_minutes cover session_type = 'LECTURE' /
 * 'PRACTICE'; other_minutes is every other session_type (EXAM, and
 * anything else that shows up later) bucketed together -- a catch-all by
 * design (2026-09-24, per request: "lecture session and also practice
 * hours and also other hours"), so a session_type this table has never
 * shown before still lands in "Other" instead of being silently dropped.
 */
export async function fetchContributionRows(): Promise<ContributionRow[]> {
  const bq = client();
  const ref = tableRef(SESSION_SCHEDULE_TABLE);
  const query = `
    SELECT
      instructor_user_id,
      SUM(CASE WHEN session_type = 'LECTURE' THEN session_duration_in_mins_from_schedule_time ELSE 0 END) AS lecture_minutes,
      SUM(CASE WHEN session_type = 'PRACTICE' THEN session_duration_in_mins_from_schedule_time ELSE 0 END) AS practice_minutes,
      SUM(CASE WHEN session_type NOT IN ('LECTURE', 'PRACTICE') THEN session_duration_in_mins_from_schedule_time ELSE 0 END) AS other_minutes,
      COUNT(*) AS sessions_completed
    FROM \`${ref}\`
    WHERE session_status = 'COMPLETED' AND instructor_user_id IS NOT NULL
    GROUP BY instructor_user_id
  `;

  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    return (rows as Array<Record<string, unknown>>)
      .map((r) => ({
        instructor_user_id: String(r.instructor_user_id ?? ""),
        lecture_minutes: Number(r.lecture_minutes ?? 0),
        practice_minutes: Number(r.practice_minutes ?? 0),
        other_minutes: Number(r.other_minutes ?? 0),
        sessions_completed: Number(r.sessions_completed ?? 0),
      }))
      .filter((r) => r.instructor_user_id);
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorContributionError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorContributionError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

/**
 * Preview of exactly what fetchContributionRows() (and therefore POST
 * /sync/instructor-contribution) produces -- run this to see the real
 * aggregated data before/without clicking Sync Now on the Contribution tab.
 */
export async function inspectContributionAggregation(): Promise<void> {
  console.log("Running the contribution aggregation query against BigQuery...");
  const rows = await fetchContributionRows();
  console.log(`\n${rows.length} distinct instructor_user_id values with at least one COMPLETED session.`);
  const totalSessions = rows.reduce((sum, r) => sum + r.sessions_completed, 0);
  const totalMinutes = rows.reduce((sum, r) => sum + r.lecture_minutes + r.practice_minutes + r.other_minutes, 0);
  console.log(`Total COMPLETED sessions: ${totalSessions.toLocaleString()}, total minutes: ${totalMinutes.toLocaleString()} (${(totalMinutes / 60).toFixed(1)} hours)`);
  console.log("\nFirst 15 rows (instructor_user_id, lecture/practice/other minutes, sessions_completed):");
  console.log(rows.slice(0, 15));
}
