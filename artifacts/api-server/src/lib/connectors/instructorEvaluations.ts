// Demo and AI-assessment time per instructor (2026-10-14, per request): reads the BigQuery view
// z_niat_instructors_demo_qa_rating_details (one row per evaluation: evaluation_type DEMO or AI_ASSESSMENT, status, final_score,
// audio_duration -- the recording length in SECONDS, stored as text -- session_date and instructor_user_id) and totals the recorded
// audio time per instructor per day and per evaluation type, so the Contribution tab can show Demo hours and AI Assessment hours.
//
// What counts: only evaluations whose status is Completed (Failed / Pending / still-processing ones have no result), and one
// evaluation per session per type -- if a session was evaluated more than once with the same type, its longest recording is used, so
// a re-run is not double counted.
//
// Source switched (2026-11-16, per request: "use only niat_session_wise_qa_rating -- it's better"): the small view above is a subset of
// niat_session_wise_qa_rating (same evaluations, same scores / lengths -- checked for NW2000396), so this now reads the QA rating view
// that Training - Demos already uses: one demo source for the whole app. Also per request, the newer training recordings now count:
// Demo hours = DEMO + TRAINING_DEMO, AI Assessment hours = AI_ASSESSMENT + TRAINING_AI_ASSESSMENT (since 6 Oct 2026). A session evaluated
// under both a plain and a training type counts once (its longest recording).
//
// PRE-PREPAREDNESS ONLY (2026-11-17, per request: "in the Contribution data, the demos and AI assessments should be the pre-preparedness
// ones -- how many, their score, and the hours spent on them -- identified with the pre-lecture readiness checklist"). A recording counts
// when it prepares for a class the instructor actually took: a plain DEMO / AI_ASSESSMENT (training types no longer count here -- they
// are on Training - Demos / Readiness) whose topic is the topic of one of the instructor's COMPLETED classes in
// niat_pre_lecture_readiness_check_list_details, recorded BEFORE that class started. Topic of a class = session_id of its QA-rated class
// recording (SCHEDULE row with the same session_section_id), else the class title from the session schedule table, compared letters /
// digits only. Rule checked with _tmp_prep_demo_rule.ts on 19,773 classes (last 30 days): "any time before the class" reproduces the
// checklist's demo_evaluations_count for 100% of classes and ai_evaluations_count for 99% (96% of classes with 1+ demo); "same day"
// only 34%. A recording that prepares several classes (same topic, several sections) counts once, on the day it was recorded.
import { BigQuery } from "@google-cloud/bigquery";
import { QA_RATING_VIEW } from "./demoTraining";
import { config, missing } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

export const READINESS_CHECKLIST_TABLE = process.env.READINESS_CHECKLIST_TABLE || "niat_reverse_etl_bases.niat_pre_lecture_readiness_check_list_details";
import { runWithHardTimeout } from "./timeout";

export class InstructorEvaluationsError extends Error {}

export const EVALUATION_TABLE = process.env.INSTRUCTOR_EVALUATION_TABLE || QA_RATING_VIEW;

export type EvaluationDailyRow = {
  instructor_user_id: string;
  session_date: string; // YYYY-MM-DD
  evaluation_type: "DEMO" | "AI_ASSESSMENT";
  seconds: number;
  evaluations: number;
  score_sum: number; // sum of final_score (0-10) over the evaluations that have a score
  scored: number; // how many evaluations have a score
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
  const P = config.BIGQUERY_PROJECT_ID, D = config.BIGQUERY_DATASET;
  const CL = `\`${P}.${READINESS_CHECKLIST_TABLE}\``, SC = `\`${P}.${D}.${SESSION_SCHEDULE_TABLE}\``;
  const KEY = (col: string) => `REGEXP_REPLACE(LOWER(IFNULL(${col}, '')), r'[^a-z0-9]', '')`;
  const query = `
    WITH cls AS (
      SELECT c.u, c.st, q.sid, sch.tk
      FROM (SELECT instructor_user_id AS u, session_section_id AS s, ANY_VALUE(SUBSTR(CAST(session_start_datetime AS STRING), 1, 19)) AS st
            FROM ${CL} WHERE UPPER(session_status) = 'COMPLETED' AND instructor_user_id IS NOT NULL GROUP BY 1, 2) c
      LEFT JOIN (SELECT session_section_id, ANY_VALUE(session_id) AS sid FROM \`${ref}\` WHERE evaluation_type = 'SCHEDULE' GROUP BY 1) q ON q.session_section_id = c.s
      LEFT JOIN (SELECT session_section_id, ANY_VALUE(${KEY("session_title")}) AS tk FROM ${SC} GROUP BY 1) sch ON sch.session_section_id = c.s
    ),
    ev AS (
      SELECT instructor_user_id, SAFE_CAST(session_date AS DATE) AS session_date, evaluation_type, session_id, ${KEY("session_title")} AS tk,
        SUBSTR(CAST(evaluation_creation_datetime AS STRING), 1, 19) AS cr, SAFE_CAST(audio_duration AS FLOAT64) AS secs, SAFE_CAST(final_score AS FLOAT64) AS score
      FROM \`${ref}\`
      WHERE UPPER(status) = 'COMPLETED' AND instructor_user_id IS NOT NULL AND SAFE_CAST(session_date AS DATE) IS NOT NULL
        AND evaluation_type IN ('DEMO', 'AI_ASSESSMENT')
    ),
    -- "recorded before some class on that topic" = recorded before the LATEST class on that topic
    last_by_sid AS (SELECT u, sid, MAX(st) AS mx FROM cls WHERE sid IS NOT NULL GROUP BY 1, 2),
    last_by_title AS (SELECT u, tk, MAX(st) AS mx FROM cls WHERE sid IS NULL AND tk != '' GROUP BY 1, 2),
    prep AS (
      SELECT ev.* FROM ev
      LEFT JOIN last_by_sid a ON a.u = ev.instructor_user_id AND a.sid = ev.session_id
      LEFT JOIN last_by_title b ON b.u = ev.instructor_user_id AND b.tk = ev.tk
      WHERE a.mx > ev.cr OR b.mx > ev.cr
    )
    SELECT
      instructor_user_id,
      FORMAT_DATE('%Y-%m-%d', session_date) AS session_date,
      evaluation_type,
      SUM(secs) AS seconds,
      COUNT(*) AS evaluations,
      SUM(score) AS score_sum,
      COUNTIF(score IS NOT NULL) AS scored
    FROM (
      SELECT instructor_user_id, session_date, evaluation_type, session_id, MAX(secs) AS secs, MAX(score) AS score
      FROM prep GROUP BY 1, 2, 3, 4
    )
    WHERE secs IS NOT NULL
    GROUP BY instructor_user_id, session_date, evaluation_type
  `;
  try {
    const [rows] = await runWithHardTimeout(() => bq.query({ query }), 240000);
    return (rows as Array<Record<string, unknown>>)
      .map((r) => ({
        instructor_user_id: String(r.instructor_user_id ?? ""),
        session_date: String(r.session_date ?? ""),
        evaluation_type: (r.evaluation_type === "DEMO" ? "DEMO" : "AI_ASSESSMENT") as "DEMO" | "AI_ASSESSMENT",
        seconds: Math.round(Number(r.seconds ?? 0)),
        evaluations: Number(r.evaluations ?? 0),
        score_sum: Number(r.score_sum ?? 0),
        scored: Number(r.scored ?? 0),
      }))
      .filter((r) => r.instructor_user_id && /^\d{4}-\d{2}-\d{2}$/.test(r.session_date));
  } catch (e) {
    throw new InstructorEvaluationsError(`Query against ${ref} failed: ${(e as Error).message}`);
  }
}
