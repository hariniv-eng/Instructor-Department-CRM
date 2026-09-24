// Discovery-only client for the two BigQuery tables behind the upcoming
// "instructor learning status" feature (tracks an instructor's OWN
// training/upskilling progress -- not the session-teaching completion the
// rest of this app already tracks via bigquery.ts):
//
//   1. niat_instructor_unit_wise_completion_and_best_attempt_details
//   2. niat_instructor_pracitce_exam_assessment_and_question_set_all_attempt_details
//      ("pracitce" is the real table name's own spelling -- not a typo here,
//      don't "fix" it without confirming the live table is actually named
//      that way.)
//
// Table (1) was this app's very first BIGQUERY_TABLE, before being dropped
// on 2026-08-25 in favor of niat_instructor_managers_and_instructors_details
// because it "had no role/category/manager columns at all" (see bigquery.ts's
// header comment) -- it was never evaluated for what it DOES have, which is
// presumably unit/lesson completion + best-attempt data, exactly what this
// new feature needs. Table (2) hasn't been used by this app before at all.
//
// Real schema for table (1) is now confirmed (2026-09-23, via
// inspect:instructor-unit-completion run on Replit): 26 columns including
// instructor_user_id, course_title, completion_status ('YET_TO_START' |
// 'COMPLETED' | 'IN_PROGRESS' only -- no 'ON_HOLD' value exists anywhere).
// fetchCourseStatusRows() below aggregates it directly in BigQuery (GROUP BY
// instructor_user_id + a fixed course taxonomy, see
// ../../data/trainingCourseTaxonomy.ts) rather than pulling any of its 5.76M
// rows into Node -- one row per (instructor, tracked course) comes back.
//
// Table (2) (practice exam / question-set attempts) is still
// inspect/discovery-only below -- no aggregation built against it yet, since
// the Training Stats tab (2026-09-23) only asked for per-course completion
// status, not exam performance. Add a fetcher here the same way if that's
// wanted later.

import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout, HardTimeout } from "./timeout";
import { TRAINING_COURSE_TAXONOMY, resolvedCourseDefs, pendingCourseKeys, type TrainingCourseDef } from "../../data/trainingCourseTaxonomy";

export class InstructorLearningStatusError extends Error {}

const REQUIRED = ["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET"] as const;
const API_TIMEOUT_MS = 30000;

// Independently configurable, same convention as CAPABILITY_MANAGER_TABLE in
// capabilityManager.ts, in case either is ever renamed. Defaults are the
// exact table names given (2026-09-23), typo preserved on the second one.
export const UNIT_COMPLETION_TABLE =
  process.env.INSTRUCTOR_UNIT_COMPLETION_TABLE || "niat_instructor_unit_wise_completion_and_best_attempt_details";
export const PRACTICE_EXAM_TABLE =
  process.env.INSTRUCTOR_PRACTICE_EXAM_TABLE ||
  "niat_instructor_pracitce_exam_assessment_and_question_set_all_attempt_details";

function assertConfigured() {
  const missingKeys = missing(REQUIRED);
  if (missingKeys.length) {
    throw new InstructorLearningStatusError(
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
        throw new InstructorLearningStatusError(`GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON: ${(e as Error).message}`);
      }
      return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials });
    }
    return new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  } catch (e) {
    if (e instanceof InstructorLearningStatusError) throw e;
    throw new InstructorLearningStatusError(`Could not create BigQuery client: ${(e as Error).message}`);
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
    if (e instanceof HardTimeout) throw new InstructorLearningStatusError(`Could not read table ${ref}: ${e.message}`);
    throw new InstructorLearningStatusError(`Could not read table ${ref}: ${(e as Error).message}`);
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
    if (e instanceof HardTimeout) throw new InstructorLearningStatusError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorLearningStatusError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

/** Grabs a handful of raw rows as-is (no column mapping, since real names are unknown) to see actual values, not just types. */
export async function fetchSampleRows(tableName: string, limit = 10): Promise<Record<string, unknown>[]> {
  const bq = client();
  const ref = tableRef(tableName);
  const query = `SELECT * FROM \`${ref}\` LIMIT ${limit}`;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    return rows as Record<string, unknown>[];
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorLearningStatusError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorLearningStatusError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

/**
 * Distinct values of a column + row count per value — same purpose as
 * checkDistinctValues() in bigquery.ts, but parameterized by table name
 * since this file covers two tables, not one fixed BIGQUERY_TABLE.
 * Used to map this table's real course_title / completion_status /
 * examattempt_evaluation_result values against a fixed reference list (e.g.
 * a manually-tracked course/status taxonomy) before building any
 * aggregation logic on top of them.
 */
export async function checkDistinctValues(tableName: string, column: string): Promise<void> {
  const bq = client();
  const ref = tableRef(tableName);
  const schemaFields = new Set((await getSchema(tableName)).map(([name]) => name));
  if (!schemaFields.has(column)) {
    throw new InstructorLearningStatusError(`Table ${ref} has no column "${column}". Actual columns: ${[...schemaFields].sort().join(", ")}.`);
  }
  const query = `SELECT ${column}, COUNT(*) AS row_count FROM \`${ref}\` GROUP BY ${column} ORDER BY row_count DESC`;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    console.log(`Distinct values of "${column}" in ${ref}:`);
    for (const row of rows as Record<string, unknown>[]) {
      console.log(`  ${JSON.stringify(row[column])} — ${row["row_count"]} rows`);
    }
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorLearningStatusError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorLearningStatusError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

export type CourseStatusRow = {
  instructor_user_id: string;
  course_key: string;
  track_group: string;
  status: "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";
  units_total: number;
  units_completed: number;
};

function bqStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * Aggregates niat_instructor_unit_wise_completion_and_best_attempt_details
 * per (instructor_user_id, course_key) for every RESOLVED entry in
 * courseDefs (unresolved/pending ones -- empty courseTitles -- are simply
 * skipped, since there's nothing to group by for them; the Training Stats
 * page renders those as "Mapping pending" uniformly instead). Entirely
 * server-side: the CASE expression buckets each of the table's 5.76M rows
 * into a course_key (or NULL, dropped via HAVING) before any grouping
 * happens, so only ~1 result row per (instructor, tracked course) actually
 * comes back over the wire.
 *
 * Status per (instructor, course_key): COMPLETED if >=95% of matching unit
 * rows are completion_status='COMPLETED'; NOT_STARTED if every one is
 * 'YET_TO_START' (zero progress at all); IN_PROGRESS otherwise. The 95%
 * threshold (2026-09-23, per request, after reviewing real data via
 * inspect:training-status-aggregation) replaces an earlier "literally every
 * unit" rule that was producing near-zero Completed counts across the board
 * -- e.g. an instructor with 75/76 units done (98.7%) still showed In
 * Progress under the old rule. A handful of stray optional/locked units
 * that never get clicked shouldn't keep someone who's functionally done
 * from ever showing green.
 */
// A course def matches on course_title alone, unless it also sets
// topicTitles, in which case a row must additionally have a matching
// topic_title -- needed for columns like DSA/DIA/IPS where one phase
// course_title's content actually splits across more than one of our
// columns (see the header comment on those entries in
// trainingCourseTaxonomy.ts).
function matchCondition(c: TrainingCourseDef): string {
  const courseCond = `course_title IN (${c.courseTitles.map(bqStringLiteral).join(", ")})`;
  if (c.topicTitles && c.topicTitles.length > 0) {
    return `(${courseCond} AND topic_title IN (${c.topicTitles.map(bqStringLiteral).join(", ")}))`;
  }
  return courseCond;
}

export async function fetchCourseStatusRows(courseDefs: TrainingCourseDef[]): Promise<CourseStatusRow[]> {
  const resolved = courseDefs.filter((c) => c.courseTitles.length > 0);
  if (resolved.length === 0) return [];

  const bq = client();
  const ref = tableRef(UNIT_COMPLETION_TABLE);
  const keyBranches = resolved
    .map((c) => `WHEN ${matchCondition(c)} THEN ${bqStringLiteral(c.key)}`)
    .join("\n      ");
  const groupBranches = resolved
    .map((c) => `WHEN ${matchCondition(c)} THEN ${bqStringLiteral(c.trackGroup)}`)
    .join("\n      ");

  const query = `
    SELECT
      instructor_user_id,
      CASE
      ${keyBranches}
      END AS course_key,
      CASE
      ${groupBranches}
      END AS track_group,
      CASE
        WHEN SAFE_DIVIDE(COUNTIF(completion_status = 'COMPLETED'), COUNT(*)) >= 0.95 THEN 'COMPLETED'
        WHEN COUNTIF(completion_status != 'YET_TO_START') = 0 THEN 'NOT_STARTED'
        ELSE 'IN_PROGRESS'
      END AS status,
      COUNT(*) AS units_total,
      COUNTIF(completion_status = 'COMPLETED') AS units_completed
    FROM \`${ref}\`
    GROUP BY instructor_user_id, course_key, track_group
    HAVING course_key IS NOT NULL
  `;

  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    return (rows as Array<Record<string, unknown>>)
      .map((r) => ({
        instructor_user_id: String(r.instructor_user_id ?? ""),
        course_key: String(r.course_key ?? ""),
        track_group: String(r.track_group ?? ""),
        status: (r.status as CourseStatusRow["status"]) ?? "NOT_STARTED",
        units_total: Number(r.units_total ?? 0),
        units_completed: Number(r.units_completed ?? 0),
      }))
      .filter((r) => r.instructor_user_id);
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorLearningStatusError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorLearningStatusError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

/**
 * Preview of exactly what fetchCourseStatusRows() (and therefore
 * POST /sync/training-status) actually produces -- run this to see the
 * real aggregated data before/without clicking Sync Now on the Training
 * Stats page itself. Prints one row count + status breakdown per resolved
 * course, plus a handful of raw sample rows so it's clear what an
 * (instructor_user_id, course_key) row looks like.
 */
export async function inspectTrainingStatusAggregation(): Promise<void> {
  const defs = resolvedCourseDefs();
  console.log(`${defs.length} of ${TRAINING_COURSE_TAXONOMY.length} taxonomy columns have a confirmed course_title mapping (see trainingCourseTaxonomy.ts) -- only these are queried:`);
  defs.forEach((d) => console.log(`  - ${d.label} [${d.key}] (${d.trackGroup}): ${d.courseTitles.join(" | ")}`));
  const pending = pendingCourseKeys();
  if (pending.length) console.log(`\n${pending.length} columns still pending a mapping (skipped): ${pending.join(", ")}`);

  console.log("\nRunning the aggregation query against BigQuery...");
  const rows = await fetchCourseStatusRows(defs);
  console.log(`\n${rows.length} total (instructor, course) rows came back.`);

  const distinctInstructors = new Set(rows.map((r) => r.instructor_user_id)).size;
  console.log(`Distinct instructor_user_id values represented: ${distinctInstructors}`);

  const byCourse = new Map<string, { COMPLETED: number; IN_PROGRESS: number; NOT_STARTED: number }>();
  for (const r of rows) {
    if (!byCourse.has(r.course_key)) byCourse.set(r.course_key, { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 });
    byCourse.get(r.course_key)![r.status]++;
  }
  console.log("\nPer-course status breakdown (instructor count per status):");
  for (const def of defs) {
    const counts = byCourse.get(def.key) ?? { COMPLETED: 0, IN_PROGRESS: 0, NOT_STARTED: 0 };
    console.log(`  ${def.label}: ✅ ${counts.COMPLETED} completed, 🟡 ${counts.IN_PROGRESS} in progress, ❌ ${counts.NOT_STARTED} not started`);
  }

  console.log("\nFirst 15 raw rows (instructor_user_id, course_key, track_group, status, units_completed/units_total):");
  console.log(rows.slice(0, 15));
}

/**
 * Discovery helper (2026-09-24, per request) -- lists every distinct
 * topic_title under one specific course_title, with row counts, ordered by
 * course_unit_order so they read in the actual curriculum sequence. Used
 * after findCoursesForTopics() below turned up only partial/generic matches
 * for the DSA-track session names Ankush provided -- this dumps the REAL
 * topic_title wording for a candidate course so it can be eyeballed against
 * his syllabus (the two are likely the same content under different exact
 * phrasing, not a wrong course).
 */
export async function listTopicsForCourse(courseTitle: string): Promise<void> {
  const bq = client();
  const ref = tableRef(UNIT_COMPLETION_TABLE);
  const query = `
    SELECT topic_title, MIN(course_unit_order) AS min_order, COUNT(*) AS row_count
    FROM \`${ref}\`
    WHERE course_title = ${bqStringLiteral(courseTitle)}
    GROUP BY topic_title
    ORDER BY min_order
  `;
  console.log(`Distinct topic_title values under course_title = "${courseTitle}", in curriculum order:`);
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    for (const row of rows as Record<string, unknown>[]) {
      console.log(`  ${JSON.stringify(row["topic_title"])} -- ${row["row_count"]} rows (order ${row["min_order"]})`);
    }
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorLearningStatusError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorLearningStatusError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}

/**
 * Discovery helper (2026-09-24, per request) for resolving the three still-
 * pending DSA-track taxonomy columns (dsa, dia, ips -- see
 * trainingCourseTaxonomy.ts). Ankush provided the real "Session Name" values
 * from the learning platform's own module breakdown for each of DSA/DIA/IPS
 * -- see dsaTrackSessionNames.ts. Those match the grain of this table's
 * `topic_title` column (confirmed via inspect:instructor-unit-completion:
 * topic_title, e.g. "For Loop", groups several finer unit_title rows
 * underneath it -- same level as a "Session Name").
 *
 * This looks up which real course_title(s) actually contain those topic
 * names in the live data, so the taxonomy can be wired up correctly instead
 * of guessing from the candidate course_title list alone.
 */
export async function findCoursesForTopics(topics: string[]): Promise<void> {
  if (topics.length === 0) {
    console.log("No topic names given.");
    return;
  }
  const bq = client();
  const ref = tableRef(UNIT_COMPLETION_TABLE);
  const query = `
    SELECT course_title, topic_title, COUNT(*) AS row_count
    FROM \`${ref}\`
    WHERE topic_title IN (${topics.map(bqStringLiteral).join(", ")})
    GROUP BY course_title, topic_title
    ORDER BY course_title, row_count DESC
  `;

  console.log(`Looking up which course_title(s) contain these ${topics.length} topic_title values...`);
  let rows: Array<Record<string, unknown>>;
  try {
    const [result] = await runWithHardTimeout(() => bq.query({ query }), API_TIMEOUT_MS * 3 + 10000);
    rows = result as Array<Record<string, unknown>>;
  } catch (e) {
    if (e instanceof HardTimeout) throw new InstructorLearningStatusError(`Query against ${ref} failed: ${e.message}`);
    throw new InstructorLearningStatusError(`Query against ${ref} failed: ${(e as Error).message}`);
  }

  const byCourse = new Map<string, { rowCount: number; topics: Set<string> }>();
  for (const r of rows) {
    const course = String(r.course_title ?? "(null)");
    if (!byCourse.has(course)) byCourse.set(course, { rowCount: 0, topics: new Set() });
    const entry = byCourse.get(course)!;
    entry.rowCount += Number(r.row_count ?? 0);
    entry.topics.add(String(r.topic_title ?? ""));
  }

  console.log(`\ncourse_title values these topics appear under:`);
  for (const [course, info] of [...byCourse.entries()].sort((a, b) => b[1].rowCount - a[1].rowCount)) {
    console.log(`  "${course}" -- ${info.rowCount} rows, matches ${info.topics.size}/${topics.length} of the given topic names: ${[...info.topics].join(", ")}`);
  }

  const matchedTopics = new Set(rows.map((r) => String(r.topic_title ?? "")));
  const unmatched = topics.filter((t) => !matchedTopics.has(t));
  if (unmatched.length) {
    console.log(`\n${unmatched.length} topic name(s) had NO match at all in the data (check spelling/casing/extra spaces):`);
    unmatched.forEach((t) => console.log(`  - "${t}"`));
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

/** Run: `npx tsx src/lib/connectors/inspect.ts instructor-unit-completion` (with .env loaded, or live on Replit). */
export async function inspectUnitCompletion(): Promise<void> {
  await inspectTable(UNIT_COMPLETION_TABLE);
}

/** Run: `npx tsx src/lib/connectors/inspect.ts instructor-practice-exam` (with .env loaded, or live on Replit). */
export async function inspectPracticeExamAttempts(): Promise<void> {
  await inspectTable(PRACTICE_EXAM_TABLE);
}
