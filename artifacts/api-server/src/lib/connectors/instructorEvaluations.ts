// Demo and AI-assessment time per instructor (2026-10-14, per request): reads the BigQuery view
// z_niat_instructors_demo_qa_rating_details (one row per evaluation: evaluation_type DEMO or AI_ASSESSMENT, status, final_score,
// audio_duration -- the recording length in SECONDS, stored as text -- session_date and instructor_user_id) and totals the recorded
// audio time per instructor per day and per evaluation type, so the Contribution tab can show Demo hours and AI Assessment hours.
//
// What counts: only evaluations whose status is Completed (Failed / Pending / still-processing ones have no result), and one
// evaluation per session per type -- if a session was evaluated more than once with the same type, its longest recording is used, so
// a re-run is not double counted.
import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout } from "./timeout";

export class InstructorEvaluationsError extends Error {}

export const EVALUATION_TABLE = process.env.INSTRUCTOR_EVALUATION_TABLE || "z_niat_instructors_demo_qa_rating_details";

export type EvaluationDailyRow = {
  instructor_user_id: string;
  session_date: string; // YYYY-MM-DD
  evaluation_type: "DEMO" | "AI_ASSESSMENT";
  seconds: number;
  evaluations: number;
};

export async function fetchEvaluationDailyRows(): Promise<EvaluationDailyRow[]> {
  const missingKeys = missing(["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET"] as const);
  if (missingKeys.length) throw new InstructorEvaluationsError(`BigQuery settings are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
  let bq: BigQuery;
  try {
    bq = config.BIGQUERY_CREDENTIALS_JSON
      ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
      : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  } catch (e) {
    throw new InstructorEvaluationsError(`Could not create BigQuery client: ${(e as Error).message}`);
  }
  const ref = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${EVALUATION_TABLE}`;
  const query = `
    SELECT
      instructor_user_id,
      FORMAT_DATE('%Y-%m-%d', session_date) AS session_date,
      evaluation_type,
      SUM(secs) AS seconds,
      COUNT(*) AS evaluations
    FROM (
      SELECT instructor_user_id, session_date, evaluation_type, session_id, MAX(SAFE_CAST(audio_duration AS FLOAT64)) AS secs
      FROM \`${ref}\`
      WHERE UPPER(status) = 'COMPLETED'
        AND instructor_user_id IS NOT NULL
        AND session_date IS NOT NULL
        AND evaluation_type IN ('DEMO', 'AI_ASSESSMENT')
      GROUP BY instructor_user_id, session_date, evaluation_type, session_id
    )
    WHERE secs IS NOT NULL
    GROUP BY instructor_user_id, session_date, evaluation_type
  `;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), 100000);
    return (rows as Array<Record<string, unknown>>)
      .map((r) => ({
        instructor_user_id: String(r.instructor_user_id ?? ""),
        session_date: String(r.session_date ?? ""),
        evaluation_type: (r.evaluation_type === "DEMO" ? "DEMO" : "AI_ASSESSMENT") as "DEMO" | "AI_ASSESSMENT",
        seconds: Math.round(Number(r.seconds ?? 0)),
        evaluations: Number(r.evaluations ?? 0),
      }))
      .filter((r) => r.instructor_user_id && /^\d{4}-\d{2}-\d{2}$/.test(r.session_date));
  } catch (e) {
    throw new InstructorEvaluationsError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}
