// Learning time per instructor (2026-10-15, per request): reads the BigQuery view
// z_niat_instructor_day_wise_unit_wise_time_spent_details (one row per instructor per unit per day; datewise_total_time_spent_in_sec
// is the time spent on that unit on that date -- verified to be a per-row value, not a repeated per-day total) and totals it per
// instructor per day, so the Contribution tab can show total learning hours that follow the date filter.
import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout } from "./timeout";

export class InstructorTimeSpentError extends Error {}

export const TIME_SPENT_TABLE = process.env.INSTRUCTOR_TIME_SPENT_TABLE || "z_niat_instructor_day_wise_unit_wise_time_spent_details";

export type TimeSpentDailyRow = {
  instructor_user_id: string;
  activity_date: string; // YYYY-MM-DD
  seconds: number;
  units: number;
};

export async function fetchTimeSpentDailyRows(): Promise<TimeSpentDailyRow[]> {
  const missingKeys = missing(["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET"] as const);
  if (missingKeys.length) throw new InstructorTimeSpentError(`BigQuery settings are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
  let bq: BigQuery;
  try {
    bq = config.BIGQUERY_CREDENTIALS_JSON
      ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
      : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  } catch (e) {
    throw new InstructorTimeSpentError(`Could not create BigQuery client: ${(e as Error).message}`);
  }
  const ref = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${TIME_SPENT_TABLE}`;
  const query = `
    SELECT
      instructor_user_id,
      FORMAT_DATE('%Y-%m-%d', date) AS activity_date,
      SUM(datewise_total_time_spent_in_sec) AS seconds,
      COUNT(DISTINCT unit_id) AS units
    FROM \`${ref}\`
    WHERE instructor_user_id IS NOT NULL
      AND date IS NOT NULL
      AND datewise_total_time_spent_in_sec IS NOT NULL
    GROUP BY instructor_user_id, date
  `;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), 100000);
    return (rows as Array<Record<string, unknown>>)
      .map((r) => ({
        instructor_user_id: String(r.instructor_user_id ?? ""),
        activity_date: String(r.activity_date ?? ""),
        seconds: Math.round(Number(r.seconds ?? 0)),
        units: Number(r.units ?? 0),
      }))
      .filter((r) => r.instructor_user_id && /^\d{4}-\d{2}-\d{2}$/.test(r.activity_date));
  } catch (e) {
    throw new InstructorTimeSpentError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}
