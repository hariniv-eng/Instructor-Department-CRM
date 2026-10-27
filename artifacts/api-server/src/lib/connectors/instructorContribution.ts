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
import { getSchema } from "./instructorLearningStatus";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";
import { TEACHING_COURSE_SUBJECTS, TAUGHT_COURSE_TITLE_SUBJECTS } from "../../data/teachingCourseSubjects";

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

/**
 * NIAT cohort per real-world student batch (2026-09-29, per request --
 * business logic given directly by Ankush, not derivable from BigQuery
 * itself since the source table has no cohort/intake-year column):
 *
 * - Nxtwave Institute of Advanced Technologies (the founding institute)
 *   only ever ran one batch, named "Batch 2" in this table -- that's the
 *   company's very first cohort, NIAT 2024.
 * - Every other university that has both a Batch 1 and a Batch 2: Batch 1
 *   = NIAT 2025, Batch 2 = NIAT 2026.
 * - Exception: NIAT Chevella and Malla Reddy Vishwavidyapeeth each only
 *   have one batch (no Batch 2), but that one batch is still NIAT 2025,
 *   same as a "Batch 1" would be -- not NIAT 2026 like other single-batch
 *   universities.
 * - Every other university with only one batch (i.e. every single-batch
 *   university except the two exceptions above): that one batch = NIAT
 *   2026.
 * - Left out entirely (no cohort assigned, simply absent from this map) --
 *   Training Institute (NIAT's own internal training program, not a
 *   partner university), IIT Kharagpur (a course collaboration, not a
 *   college batch of enrolled students -- "we will not touch IIT
 *   Kharagpur instructors or that classes"), and every Intensive
 *   Offline/Training internal program batch_name (IO B../IO PFS../IO
 *   JFS.., M1/M2/A1, "Intensive Offline Python Batch N", "Intensive
 *   Training Python Batch 1", "Intensive Offline Placed Batch") -- none
 *   of these are college-batch partnerships in the first place.
 *
 * Keyed by the raw batch_name string (same convention as all_batches/
 * recent_batches below) rather than institute_id. Exactly one ambiguous
 * case exists in the real data: a single stray session row tagged to a
 * separate "Chalapathy (CIET)" institute_id shares the exact literal
 * batch_name ("CITY Batch -1") with the real "Chalapathy (CITY)"
 * university's Batch 1. Keying by string folds that stray row into
 * CITY's Batch 1 (2025) rather than giving it its own entry -- the right
 * outcome, since it's almost certainly the same real batch just
 * mis-tagged, and Ankush confirmed to leave "Chalapathy (CIET)" out as
 * its own distinct entity ("leave this one").
 *
 * Confirmed against the full distinct institute_id/batch_name breakdown
 * on 2026-09-29 (see _tmp_institute_name_batches.ts). If BigQuery ever
 * returns a batch_name not in this map (a new batch just started, or a
 * new partner institute), cohortsForBatches() below simply won't produce
 * a cohort for it rather than guessing -- it just needs an entry added
 * here once someone confirms which cohort it belongs to.
 */
export const NIAT_COHORT_2024 = "NIAT 2024";
export const NIAT_COHORT_2025 = "NIAT 2025";
export const NIAT_COHORT_2026 = "NIAT 2026";

export const BATCH_NAME_TO_NIAT_COHORT: Record<string, string> = {
  // Nxtwave Institute of Advanced Technologies -- the founding cohort.
  "Batch 2": NIAT_COHORT_2024,

  // Universities running both Batch 1 (-> 2025) and Batch 2 (-> 2026).
  "ADYPU Batch-1": NIAT_COHORT_2025,
  "ADYPU Batch-2": NIAT_COHORT_2026,
  "AMET Batch -1": NIAT_COHORT_2025,
  "AMET Batch - 2": NIAT_COHORT_2026,
  "ANNAMACHARYA Batch- 1": NIAT_COHORT_2025,
  "Annamacharya University Batch 2": NIAT_COHORT_2026,
  "AURORA Batch -1": NIAT_COHORT_2025,
  "AURORA Batch -2": NIAT_COHORT_2026,
  "CDU Batch-1": NIAT_COHORT_2025,
  "Chaitanya Deemed-to-be University": NIAT_COHORT_2026,
  "CITY Batch -1": NIAT_COHORT_2025,
  "CITY Batch 2": NIAT_COHORT_2026,
  "CU Batch-1": NIAT_COHORT_2025,
  "Crescent University Batch 2": NIAT_COHORT_2026,
  "NRI Batch-1": NIAT_COHORT_2025,
  "NRI Batch 2": NIAT_COHORT_2026,
  "NSRIT Batch-1": NIAT_COHORT_2025,
  "NSRIT University Batch 2": NIAT_COHORT_2026,
  "S-VYASA Batch-1": NIAT_COHORT_2025,
  "S-VYASA Batch-2": NIAT_COHORT_2026,
  "SGU Batch-1": NIAT_COHORT_2025,
  "SGU Batch - 2": NIAT_COHORT_2026,
  "TU Batch-1": NIAT_COHORT_2025,
  "Takshasila University Batch 2": NIAT_COHORT_2026,
  "VGU Batch-1": NIAT_COHORT_2025,
  "VGU Batch-2": NIAT_COHORT_2026,
  "YENEPOYA Batch-1 CSE AI": NIAT_COHORT_2025,
  "YENEPOYA Batch-2 CSE AI": NIAT_COHORT_2026,

  // Exception pair -- only one batch each, but still NIAT 2025.
  "NIAT Chevella Batch-1": NIAT_COHORT_2025,
  "Malla Reddy Batch-1 CSE AI Data Science": NIAT_COHORT_2025,

  // Every other single-batch university -> NIAT 2026.
  "Alard University Batch 1": NIAT_COHORT_2026,
  "BEST University Batch 1": NIAT_COHORT_2026,
  "Bharath University": NIAT_COHORT_2026,
  "GMRIT": NIAT_COHORT_2026,
  "Geeta-Batch 1": NIAT_COHORT_2026,
  "Joy University Batch 1": NIAT_COHORT_2026,
  "LIMAT": NIAT_COHORT_2026,
  "Lingaya's Vidyapeeth Batch 1": NIAT_COHORT_2026,
  "Malla Reddy Tirupati Batch 1": NIAT_COHORT_2026,
  "Malla Reddy University Batch 1": NIAT_COHORT_2026,
  // Added 2026-10-13, per request: MVR College of Engineering & Technology is a 2026 cohort.
  "MVR College Batch 1": NIAT_COHORT_2026,
  "Noida International University Batch -1": NIAT_COHORT_2025,
  "Noida International University Batch 1": NIAT_COHORT_2025,
  "P K Das University": NIAT_COHORT_2026,
  "SGSU Batch 1": NIAT_COHORT_2026,
  "SMRU Batch 1": NIAT_COHORT_2026,
  "SNS University": NIAT_COHORT_2026,
  "SPIHER Bengaluru Batch 1": NIAT_COHORT_2026,
  "SPIHER University Chennai Batch 1": NIAT_COHORT_2026,
  "Sandip University Batch 1": NIAT_COHORT_2026,
  "Sanskriti University Batch 1": NIAT_COHORT_2026,
  "Sri Sri University Batch 1": NIAT_COHORT_2026,
  "Subharti University- Batch 1": NIAT_COHORT_2026,
  "Sushanth Batch 1": NIAT_COHORT_2026,
  "TS Mishra Batch 1": NIAT_COHORT_2026,
  "Visakha Institute of Engineering & Technology Batch 1": NIAT_COHORT_2026,
  "YENEPOYA BA Batch-1 CSE AI": NIAT_COHORT_2026,

  // Batch names as BigQuery spells them since the 2026-27 academic year (found 2026-10-27 with _tmp_cohort_check.ts: almost every
  // batch was renamed, e.g. "CDU Batch-1" -> "CDU Batch -1", "Bharath University" -> "Bharath University Batch -1"), mapped to the
  // same cohort as the old name of the same university and batch. "KKH Batch -2" is the founding institute's batch (was "Batch 2").
  "KKH Batch -2": NIAT_COHORT_2024,
  "Noida International University Batch -2": NIAT_COHORT_2026,
  "CDU Batch -1": NIAT_COHORT_2025,
  "CDU Batch -2": NIAT_COHORT_2026,
  "Malla Reddy University Batch -1": NIAT_COHORT_2026,
  "SMRU Batch -1": NIAT_COHORT_2026,
  "SPIHER Bengaluru Batch -1": NIAT_COHORT_2026,
  "S-VYASA Batch -1": NIAT_COHORT_2025,
  "S-VYASA Batch -2": NIAT_COHORT_2026,
  "VGU Batch -1": NIAT_COHORT_2025,
  "VGU Batch -2": NIAT_COHORT_2026,
  "NRI Batch -1": NIAT_COHORT_2025,
  "NRI Batch -2": NIAT_COHORT_2026,
  "NIAT Chevella Batch -1": NIAT_COHORT_2025,
  "Yenepoya KA CSE AI Batch -1": NIAT_COHORT_2025,
  "Yenepoya KA CSE AI Batch -2": NIAT_COHORT_2026,
  "YENEPOYA BA Batch -1": NIAT_COHORT_2026,
  "Annamacharya University Batch -1": NIAT_COHORT_2025,
  "Annamacharya University Batch -2": NIAT_COHORT_2026,
  "SGU Batch -1": NIAT_COHORT_2025,
  "SGU Batch -2": NIAT_COHORT_2026,
  "Takshasila University Batch 1": NIAT_COHORT_2025,
  "Takshasila University Batch -2": NIAT_COHORT_2026,
  "Crescent University Batch -1": NIAT_COHORT_2025,
  "Crescent University Batch -2": NIAT_COHORT_2026,
  "AMET Batch -2": NIAT_COHORT_2026,
  "CITY Batch -2": NIAT_COHORT_2026,
  "NSRIT University Batch -1": NIAT_COHORT_2025,
  "NSRIT University Batch -2": NIAT_COHORT_2026,
  "TS Mishra Batch -1": NIAT_COHORT_2026,
  "SPIHER University Chennai Batch -1": NIAT_COHORT_2026,
  "BEST University Batch -1": NIAT_COHORT_2026,
  "Sandip University Batch -1": NIAT_COHORT_2026,
  "SNS University Batch -1": NIAT_COHORT_2026,
  "Bharath University Batch -1": NIAT_COHORT_2026,
  "Lingaya's Vidyapeeth Batch -1": NIAT_COHORT_2026,
  "GMRIT Batch -1": NIAT_COHORT_2026,
  "P K Das University Batch -1": NIAT_COHORT_2026,
  "Malla Reddy Tirupati Batch -1": NIAT_COHORT_2026,
  "LIMAT Batch -1": NIAT_COHORT_2026,
  "Subharti University Batch -1": NIAT_COHORT_2026,
  "SGSU Batch -1": NIAT_COHORT_2026,
  "Sushanth University Batch -1": NIAT_COHORT_2026,
  "Geeta Batch -1": NIAT_COHORT_2026,
  "MVR College Batch -1": NIAT_COHORT_2026,
  "Visakha Institute of Engineering & Technology Batch -1": NIAT_COHORT_2026,
  "Sri Sri University Batch -1": NIAT_COHORT_2026,
  "Sanskriti University Batch -1": NIAT_COHORT_2026,
  "Joy University Batch -1": NIAT_COHORT_2026,

  // Deliberately NOT in this map -- see comment above: "Training_Institute_
  // Batch-1", "Foundations of Generative AI Micro-specialization Batch 1"
  // (IIT Kharagpur), and every Intensive Offline/Training batch_name.
};

/**
 * Distinct NIAT cohort year(s) a set of batch_name values maps to, sorted --
 * silently skips any batch_name with no confirmed cohort (see
 * BATCH_NAME_TO_NIAT_COHORT above), rather than guessing.
 */
// Same map keyed by a loose form of the name (2026-10-27), so a rename of the same batch does not drop people into "No cohort yet"
// again: lower case, the word "batch" and everything but letters/digits removed, and a name without a batch number counts as batch 1.
// So "CDU Batch-1" = "CDU Batch -1" = "cdu1", and "Bharath University" = "Bharath University Batch -1" = "bharathuniversity1".
// (Checked 2026-10-27: no two names in the map share a loose form with different cohorts.)
const looseBatchKey = (name: string): string => {
  const k = name.toLowerCase().replace(/batch/g, "").replace(/[^a-z0-9]/g, "");
  return /\d$/.test(k) ? k : `${k}1`;
};
const COHORT_BY_LOOSE_NAME = new Map(Object.entries(BATCH_NAME_TO_NIAT_COHORT).map(([k, v]) => [looseBatchKey(k), v]));
/** Cohort for one batch_name: exact name first, then the loose form; undefined when not confirmed (never guessed). */
export function cohortForBatch(name: string): string | undefined {
  return BATCH_NAME_TO_NIAT_COHORT[name] ?? COHORT_BY_LOOSE_NAME.get(looseBatchKey(name));
}
export function cohortsForBatches(batchNames: string[]): string[] {
  const cohorts = new Set<string>();
  for (const name of batchNames) {
    const cohort = cohortForBatch(name);
    if (cohort) cohorts.add(cohort);
  }
  return [...cohorts].sort();
}

export type ContributionRow = {
  instructor_user_id: string;
  lecture_minutes: number;
  practice_minutes: number;
  other_minutes: number;
  sessions_completed: number;
  // Per request 2026-10-12: Lecture / Practice session counts, and distinct days on which those sessions happened.
  lecture_sessions: number;
  practice_sessions: number;
  // Completed sessions that are neither Lecture nor Practice (exams and other types), 2026-10-15 per request. sessions_completed is the
  // complete total (Lecture + Practice + Other) and session_days counts every day with any completed session.
  other_sessions: number;
  session_days: number;
  // First session ever scheduled for this instructor, YYYY-MM-DD (null when none has a start date).
  deployment_date: string | null;
  // Batch coverage (2026-09-28, per request: "in one column add all the
  // batches that are associated with all the instructors, and in other
  // column only put batch_names which he have been taking from past 1
  // month") -- both scoped to COMPLETED sessions only, same as every other
  // column on this row (see the WHERE clause below), for consistency with
  // the rest of the Contribution tab. all_batches is every distinct
  // batch_name this instructor has ever taught; recent_batches is the
  // subset taught in the last 30 days (by session_start_datetime).
  all_batches: string[];
  recent_batches: string[];
  // NIAT cohort year(s) (2026-09-29, per request, later revised same day
  // to use recent_batches instead of all_batches -- "the contribution
  // column value should be added on the basis of the last batch of the
  // last 30 days only") -- derived from recent_batches via
  // BATCH_NAME_TO_NIAT_COHORT above, so this reflects the cohort(s) this
  // instructor is CURRENTLY teaching, not every cohort they've ever
  // touched.
  niat_cohorts: string[];
  // Completed sessions in the last 30 days per subject (2026-10-17) -- see fetchSessionSubjects below.
  session_subjects: Record<string, number>;
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
// Deployment date (2026-10-13, per request): the date of the first session ever scheduled for each instructor -- earliest
// session_start_datetime across ALL their sessions, whatever the status, so someone whose first sessions are still upcoming
// or were cancelled still gets a date. One small query, merged into each contribution row below.
async function fetchDeploymentDates(): Promise<Map<string, string>> {
  const bq = client();
  const ref = tableRef(SESSION_SCHEDULE_TABLE);
  const query = `
    SELECT instructor_user_id, FORMAT_DATE('%Y-%m-%d', MIN(DATE(session_start_datetime))) AS deployment_date
    FROM \`${ref}\`
    WHERE instructor_user_id IS NOT NULL AND session_start_datetime IS NOT NULL
    GROUP BY instructor_user_id
  `;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    const map = new Map<string, string>();
    for (const r of rows as Array<Record<string, unknown>>) {
      const id = String(r.instructor_user_id ?? "");
      const date = String(r.deployment_date ?? "");
      if (id && /^\d{4}-\d{2}-\d{2}$/.test(date)) map.set(id, date);
    }
    return map;
  } catch (e) {
    throw new InstructorContributionError(`Deployment-date query against ${ref} failed: ${(e as Error).message}`);
  }
}

// Cohort batches including PENDING (upcoming) sessions (2026-10-13, per request: "even if that session is pending, consider
// that also"). The hours/session columns stay COMPLETED-only; only the NIAT cohort uses this. Looks at COMPLETED and PENDING
// sessions from 60 days ago to 30 days ahead: `recent` = batches from the last 30 days up to 30 days ahead, `twoMonths` =
// the wider 60-days-back window used when `recent` is empty. A failure here is logged and ignored so the Contribution
// sync itself never fails because of it (cohorts then fall back to completed sessions only).
async function fetchCohortBatchWindows(): Promise<Map<string, { recent: string[]; twoMonths: string[] }>> {
  const bq = client();
  const ref = tableRef(SESSION_SCHEDULE_TABLE);
  const query = `
    SELECT
      instructor_user_id,
      ARRAY_AGG(DISTINCT CASE WHEN session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY) THEN batch_name END IGNORE NULLS) AS recent_batches,
      ARRAY_AGG(DISTINCT batch_name IGNORE NULLS) AS two_month_batches
    FROM \`${ref}\`
    WHERE UPPER(session_status) IN ('COMPLETED', 'PENDING') AND instructor_user_id IS NOT NULL
      AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 60 DAY)
      AND session_start_datetime <= DATETIME_ADD(CURRENT_DATETIME(), INTERVAL 30 DAY)
    GROUP BY instructor_user_id
  `;
  const map = new Map<string, { recent: string[]; twoMonths: string[] }>();
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    for (const r of rows as Array<Record<string, unknown>>) {
      const id = String(r.instructor_user_id ?? "");
      if (!id) continue;
      map.set(id, {
        recent: Array.isArray(r.recent_batches) ? r.recent_batches.map((v) => String(v)) : [],
        twoMonths: Array.isArray(r.two_month_batches) ? r.two_month_batches.map((v) => String(v)) : [],
      });
    }
  } catch (e) {
    console.error(`[contribution] cohort window query failed, using completed sessions only: ${(e as Error).message}`);
  }
  return map;
}

// Only Lecture and Practice sessions count (2026-10-17, per request): exams and other session types are often invigilated outside the
// person's own subject (e.g. an Aptitude instructor showed "English + Aptitude" because of English exams), so they are left out.
// Subject from sessions (2026-10-17, per request: "depending on the subject that they are taking, we are gonna map them ... if they take
// two subjects, map them both"). Every COMPLETED session in the last 30 days is matched by its course id (2026-10-17: id only, no titles) to
// the Training Stats course list (trainingCourseTaxonomy.ts) and so to a subject; the result is sessions per subject per instructor,
// plus "__unmatched" for sessions whose course belongs to no subject there. The course columns are found from the view's schema. A
// failure is logged and ignored (empty map), so the Contribution sync never fails because of it.
export const TRACK_SUBJECT: Record<string, string> = {
  "Frontend Development": "Frontend", "Backend Development": "Backend", DSA: "DSA", "Gen AI": "GenAI",
  DSML: "Artificial Intelligence & Emerging Technologies", Aptitude: "Aptitude", Maths: "Maths", English: "English",
};
// Orientation / intro courses (same rule as ORIENTATION_COURSE in taughtTraining.ts -- kept as a copy to avoid a circular import).
const ORIENTATION_TITLE = /^(intro|introduction) to (tech|software( development)?|operating systems?|os|computers?)\b|orientation|welcome webinar|webinar/i;
// Subject from words in a course name or course category (2026-10-24): the last resort before showing the course by name.
function subjectFromWords(text: string): string | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  if (/aptitude|reasoning|numerical ability|verbal ability/.test(t)) return "Aptitude";
  if (/english|communicat|language analytics|grammar|writing/.test(t)) return "English";
  if (/probability|statistic|linear algebra|calculus|discrete math|mathemat|\bmaths?\b/.test(t)) return "Maths";
  if (/generative ai|\bgen ?ai\b|\bllm/.test(t)) return "GenAI";
  if (/machine learning|deep learning|data science|\bdsml\b|\bml\b|data visuali|\bnlp\b/.test(t)) return "Artificial Intelligence & Emerging Technologies";
  if (/data structure|algorithm|\bdsa\b/.test(t)) return "DSA";
  if (/html|css|javascript|\bjs\b|react|frontend|front end|responsive|web design/.test(t)) return "Frontend";
  if (/python|node|backend|back end|database|dbms|sql|django|java\b|spring|express/.test(t)) return "Backend";
  return null;
}
async function fetchSessionSubjects(): Promise<Map<string, Record<string, number>>> {
  const map = new Map<string, Record<string, number>>();
  const previous = new Map<string, Record<string, number>>();
  try {
    const cols = (await getSchema(SESSION_SCHEDULE_TABLE)).map(([name]) => name);
    const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c)) ?? null;
    const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c)) ?? null;
    if (!idCol && !titleCol) {
      console.warn(`[contribution] ${SESSION_SCHEDULE_TABLE} has no course column; Subject from sessions stays empty.`);
      return map;
    }
    const byId = new Map<string, string>();
    for (const def of TRAINING_COURSE_TAXONOMY) {
      // Mathematics for Computer Science is shown by its own name instead of "Maths" (2026-10-17, per request); it still counts as
      // Maths for the Contribution tab's mismatch check.
      const subject = def.key === "math_for_cs" ? "Math for Computer Science" : TRACK_SUBJECT[def.trackGroup];
      if (!subject) continue;
      for (const id of def.courseIds ?? []) byId.set(id.replace(/-/g, "").toLowerCase(), subject);
    }
    const bq = client();
    const query = `
      SELECT instructor_user_id,
        ${idCol ? `REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '')` : "NULL"} AS course_id,
        ${titleCol ? `CAST(${titleCol} AS STRING)` : "NULL"} AS course_title,
        ${cols.includes("semester_course_title") ? "CAST(semester_course_title AS STRING)" : "NULL"} AS semester_title,
        ${cols.includes("course_category") ? "CAST(course_category AS STRING)" : "NULL"} AS category,
        -- Last 30 days = "recent"; the 30 days before that = "previous" (2026-10-24: used only for people with no recent sessions).
        IF(session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY), 'recent', 'previous') AS period,
        COUNT(*) AS sessions
      FROM \`${tableRef(SESSION_SCHEDULE_TABLE)}\`
      WHERE session_status = 'COMPLETED' AND instructor_user_id IS NOT NULL
        AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 60 DAY)
        AND session_start_datetime <= CURRENT_DATETIME()
        AND session_type IN ('LECTURE', 'PRACTICE')
      GROUP BY 1, 2, 3, 4, 5, 6
    `;
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    for (const r of rows as Array<Record<string, unknown>>) {
      const id = String(r.instructor_user_id ?? "");
      if (!id) continue;
      const courseId = r.course_id ? String(r.course_id) : "";
      // Teaching-course list first (2026-10-17: the courses instructors teach -- see teachingCourseSubjects.ts; null there = a general
      // course, kept as "__general" and left out of the subject), then the training course list, else "__unmatched".
      const teaching = courseId && courseId in TEACHING_COURSE_SUBJECTS ? TEACHING_COURSE_SUBJECTS[courseId] : undefined;
      // Course ID first (2026-10-17). FALLBACK BY COURSE NAME (2026-10-24, per request: "fill the subject for everyone who doesn't have
      // one" -- 70 instructors taught only courses whose ids were never listed, e.g. each university's own copy of Quantitative Aptitude
      // or Math for CSE): an id on neither list uses the course-name list (TAUGHT_COURSE_TITLE_SUBJECTS); an orientation course is left
      // out; any other course is shown by its own name ("Other: <course>") instead of leaving the column blank.
      const byIdSubject = teaching !== undefined ? (teaching ?? "__general") : (courseId && byId.get(courseId)) || null;
      const title = r.course_title ? String(r.course_title).trim() : "";
      const titleKey = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
      // Then (2026-10-24, "Arpita shows No match"): many campus sessions carry NO learning-portal course at all, only the semester course
      // ("Quantitative Aptitude - II") and a course category ("APTITUDE"). Those are used next, so such sessions still get a subject.
      const semTitle = r.semester_title ? String(r.semester_title).trim() : "";
      const semKey = semTitle.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const byName = (t: string, k: string): string | null => !t ? null
        : ORIENTATION_TITLE.test(t) ? "__general"
        : /^(math|mathematics)forc(omputerscience|se)/.test(k) ? "Math for Computer Science"
        : TAUGHT_COURSE_TITLE_SUBJECTS[k] ?? subjectFromWords(t);
      const subject = byIdSubject
        ?? byName(title, titleKey)
        ?? byName(semTitle, semKey)
        ?? subjectFromWords(String(r.category ?? ""))
        ?? (title ? `Other: ${title}` : semTitle ? `Other: ${semTitle}` : "__unmatched");
      const target = String(r.period) === "recent" ? map : previous;
      const entry = target.get(id) ?? {};
      entry[subject] = (entry[subject] ?? 0) + Number(r.sessions ?? 0);
      target.set(id, entry);
    }
    // No lecture/practice sessions in the last 30 days -> use the month before (2026-10-24, per request: "if there are no sessions in
    // 30 days, check the month before"). Marked with "__previous_month" so the Contribution tab can say the subject is from then.
    for (const [id, entry] of previous) if (!map.has(id)) map.set(id, { ...entry, __previous_month: 1 });
  } catch (e) {
    console.error(`[contribution] subject-from-sessions query failed, leaving it empty: ${(e as Error).message}`);
  }
  return map;
}

export async function fetchContributionRows(): Promise<ContributionRow[]> {
  const bq = client();
  const ref = tableRef(SESSION_SCHEDULE_TABLE);
  const deploymentDates = await fetchDeploymentDates();
  const cohortWindows = await fetchCohortBatchWindows();
  const sessionSubjects = await fetchSessionSubjects();
  const query = `
    SELECT
      instructor_user_id,
      SUM(CASE WHEN session_type = 'LECTURE' THEN session_duration_in_mins_from_schedule_time ELSE 0 END) AS lecture_minutes,
      SUM(CASE WHEN session_type = 'PRACTICE' THEN session_duration_in_mins_from_schedule_time ELSE 0 END) AS practice_minutes,
      SUM(CASE WHEN session_type NOT IN ('LECTURE', 'PRACTICE') THEN session_duration_in_mins_from_schedule_time ELSE 0 END) AS other_minutes,
      -- Complete total of completed sessions: Lecture + Practice + Other (2026-10-15, per request; it was Lecture + Practice only since 2026-10-12).
      COUNT(*) AS sessions_completed,
      COUNTIF(session_type = 'LECTURE') AS lecture_sessions,
      COUNTIF(session_type = 'PRACTICE') AS practice_sessions,
      COUNTIF(session_type NOT IN ('LECTURE', 'PRACTICE')) AS other_sessions,
      COUNT(DISTINCT DATE(session_start_datetime)) AS session_days,
      ARRAY_AGG(DISTINCT batch_name IGNORE NULLS) AS all_batches,
      ARRAY_AGG(DISTINCT CASE WHEN session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY) THEN batch_name END IGNORE NULLS) AS recent_batches,
      ARRAY_AGG(DISTINCT CASE WHEN session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 60 DAY) THEN batch_name END IGNORE NULLS) AS last_two_months_batches
    FROM \`${ref}\`
    WHERE session_status = 'COMPLETED' AND instructor_user_id IS NOT NULL
    GROUP BY instructor_user_id
  `;

  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    const completedRows = rows as Array<Record<string, unknown>>;
    // People with PENDING sessions but no completed one yet get a row too (zero hours), so their cohort and deployment date show.
    const completedIds = new Set(completedRows.map((r) => String(r.instructor_user_id ?? "")));
    const pendingOnly: Array<Record<string, unknown>> = [...cohortWindows.keys()].filter((id) => !completedIds.has(id)).map((id) => ({ instructor_user_id: id }));
    return [...completedRows, ...pendingOnly]
      .map((r) => {
        const cw = cohortWindows.get(String(r.instructor_user_id ?? ""));
        const allBatches = Array.isArray(r.all_batches) ? r.all_batches.map((v) => String(v)) : [];
        const recentBatches = Array.isArray(r.recent_batches) ? r.recent_batches.map((v) => String(v)) : [];
        const lastTwoMonthsBatches = Array.isArray(r.last_two_months_batches) ? r.last_two_months_batches.map((v) => String(v)) : [];
        return {
          instructor_user_id: String(r.instructor_user_id ?? ""),
          lecture_minutes: Number(r.lecture_minutes ?? 0),
          practice_minutes: Number(r.practice_minutes ?? 0),
          other_minutes: Number(r.other_minutes ?? 0),
          sessions_completed: Number(r.sessions_completed ?? 0),
          lecture_sessions: Number(r.lecture_sessions ?? 0),
          practice_sessions: Number(r.practice_sessions ?? 0),
          other_sessions: Number(r.other_sessions ?? 0),
          session_days: Number(r.session_days ?? 0),
          deployment_date: deploymentDates.get(String(r.instructor_user_id ?? "")) ?? null,
          session_subjects: sessionSubjects.get(String(r.instructor_user_id ?? "")) ?? {},
          all_batches: allBatches,
          recent_batches: recentBatches,
          // Derived from recent_batches (last 30 days), not all_batches
          // (2026-09-29, per request: "the contribution column value
          // should be added on the basis of the last batch of the last 30
          // days only, not the all batches column") -- so someone who
          // taught Batch 1 last year but has since moved on shows only
          // their CURRENT cohort, not every cohort they've ever touched.
          // A person with zero COMPLETED sessions in the last 30 days
          // gets an empty niat_cohorts, same as they'd get an empty
          // recent_batches.
          //
          // 2026-10-09, per request ("if for the last few days there was no
          // session then take the data for last 2 months"): when the person
          // has NO completed session at all in the last 30 days, the cohort
          // falls back to the batches they taught in the last 60 days.
          // Someone who did teach in the last 30 days keeps the 30-day
          // cohort(s) only, even if those batches map to no NIAT cohort.
          // recent_batches itself stays the strict 30-day list.
          //
          // 2026-10-13, per request ("even if that session is pending, consider that also"): PENDING (upcoming) sessions count
          // towards the cohort exactly like completed ones -- the 30-day and 60-day batch lists are merged with the pending-
          // inclusive windows from fetchCohortBatchWindows() before the cohort is worked out.
          niat_cohorts: (() => {
            const recentAll = [...new Set([...recentBatches, ...(cw?.recent ?? [])])];
            const twoMonthsAll = [...new Set([...lastTwoMonthsBatches, ...(cw?.twoMonths ?? [])])];
            return cohortsForBatches(recentAll.length > 0 ? recentAll : twoMonthsAll);
          })(),
        };
      })
      .filter((r) => r.instructor_user_id);
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorContributionError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorContributionError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

export type ContributionDailyRow = {
  instructor_user_id: string;
  session_date: string; // YYYY-MM-DD
  lecture_minutes: number;
  practice_minutes: number;
  other_minutes: number;
  lecture_sessions: number;
  practice_sessions: number;
  other_sessions: number;
};

/**
 * Same COMPLETED-session data as fetchContributionRows(), but one row per instructor per calendar day
 * (2026-10-12, per request: date filter on the Contribution tab), so the page can total any from/to range.
 */
export async function fetchContributionDailyRows(): Promise<ContributionDailyRow[]> {
  const bq = client();
  const ref = tableRef(SESSION_SCHEDULE_TABLE);
  const query = `
    SELECT
      instructor_user_id,
      FORMAT_DATE('%Y-%m-%d', DATE(session_start_datetime)) AS session_date,
      SUM(CASE WHEN session_type = 'LECTURE' THEN session_duration_in_mins_from_schedule_time ELSE 0 END) AS lecture_minutes,
      SUM(CASE WHEN session_type = 'PRACTICE' THEN session_duration_in_mins_from_schedule_time ELSE 0 END) AS practice_minutes,
      SUM(CASE WHEN session_type NOT IN ('LECTURE', 'PRACTICE') THEN session_duration_in_mins_from_schedule_time ELSE 0 END) AS other_minutes,
      COUNTIF(session_type = 'LECTURE') AS lecture_sessions,
      COUNTIF(session_type = 'PRACTICE') AS practice_sessions,
      COUNTIF(session_type NOT IN ('LECTURE', 'PRACTICE')) AS other_sessions
    FROM \`${ref}\`
    WHERE session_status = 'COMPLETED' AND instructor_user_id IS NOT NULL AND session_start_datetime IS NOT NULL
    GROUP BY instructor_user_id, session_date
  `;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    return (rows as Array<Record<string, unknown>>)
      .map((r) => ({
        instructor_user_id: String(r.instructor_user_id ?? ""),
        session_date: String(r.session_date ?? ""),
        lecture_minutes: Number(r.lecture_minutes ?? 0),
        practice_minutes: Number(r.practice_minutes ?? 0),
        other_minutes: Number(r.other_minutes ?? 0),
        lecture_sessions: Number(r.lecture_sessions ?? 0),
        practice_sessions: Number(r.practice_sessions ?? 0),
        other_sessions: Number(r.other_sessions ?? 0),
      }))
      .filter((r) => r.instructor_user_id && /^\d{4}-\d{2}-\d{2}$/.test(r.session_date));
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorContributionError(`Daily query against ${ref} failed: ${e.message}`);
    throw new InstructorContributionError(`Daily query against ${ref} failed: ${(e as Error).message}`);
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

/**
 * Read-only diagnostic (2026-10-13): every session on the schedule table for the given instructors from `days` ago to
 * `daysAhead` days from now, of any status, grouped by instructor, status, type and batch. Used by
 * _tmp_scheduled_classes_check.ts to answer "do these people have classes scheduled?".
 */
export async function inspectScheduleForUsers(userIds: string[], days = 30, daysAhead = 30): Promise<Array<Record<string, unknown>>> {
  if (userIds.length === 0) return [];
  const bq = client();
  const ref = tableRef(SESSION_SCHEDULE_TABLE);
  const query = `
    SELECT instructor_user_id, session_status, session_type, batch_name,
           COUNT(*) AS sessions,
           FORMAT_DATE('%Y-%m-%d', MIN(DATE(session_start_datetime))) AS first_day,
           FORMAT_DATE('%Y-%m-%d', MAX(DATE(session_start_datetime))) AS last_day
    FROM \`${ref}\`
    WHERE instructor_user_id IN UNNEST(@ids)
      AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL ${Math.max(1, Math.floor(days))} DAY)
      AND session_start_datetime <= DATETIME_ADD(CURRENT_DATETIME(), INTERVAL ${Math.max(0, Math.floor(daysAhead))} DAY)
    GROUP BY instructor_user_id, session_status, session_type, batch_name
    ORDER BY instructor_user_id, last_day DESC
  `;
  const [rows] = await runWithHardTimeout(() => bq.query({ query, params: { ids: userIds } }), API_TIMEOUT_MS * 3 + 10000);
  return rows as Array<Record<string, unknown>>;
}
