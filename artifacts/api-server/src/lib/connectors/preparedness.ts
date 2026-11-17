// Pre-preparedness demos / AI assessments (2026-11-17), shared SQL. A recording is "pre-preparedness" when it prepares for a class the
// instructor actually took: a plain DEMO / AI_ASSESSMENT (training types never are) on the topic of one of the instructor's COMPLETED
// classes in the pre-lecture readiness checklist, recorded BEFORE that class started. Topic of a class = session_id of its QA-rated class
// recording (SCHEDULE row with the same session_section_id), else the class title from the session schedule table (letters / digits only).
// Rule checked with _tmp_prep_demo_rule.ts on 19,773 classes: "any time before the class" reproduces the checklist's demo count for 100%
// of classes and its AI count for 99%.
// Used by: Contribution (instructorEvaluations.ts -- ONLY these recordings) and Training - Demos / Readiness (demoTraining.ts,
// trainingReadiness.ts -- these recordings LEFT OUT, per request: "pre-preparedness demos should not be in the training demos data").
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

export const READINESS_CHECKLIST_TABLE = process.env.READINESS_CHECKLIST_TABLE || "niat_reverse_etl_bases.niat_pre_lecture_readiness_check_list_details";

/** WITH-clause body (no "WITH"): CTEs cls, ev, last_by_sid, last_by_title, prep. `ref` = project.dataset.qa_view (no backticks). */
export function prepCtes(ref: string): string {
  const P = config.BIGQUERY_PROJECT_ID, D = config.BIGQUERY_DATASET;
  const CL = `\`${P}.${READINESS_CHECKLIST_TABLE}\``, SC = `\`${P}.${D}.${SESSION_SCHEDULE_TABLE}\``;
  const KEY = (col: string) => `REGEXP_REPLACE(LOWER(IFNULL(${col}, '')), r'[^a-z0-9]', '')`;
  return `
    cls AS (
      SELECT c.u, c.st, q.sid, sch.tk
      FROM (SELECT instructor_user_id AS u, session_section_id AS s, ANY_VALUE(SUBSTR(CAST(session_start_datetime AS STRING), 1, 19)) AS st
            FROM ${CL} WHERE UPPER(session_status) = 'COMPLETED' AND instructor_user_id IS NOT NULL GROUP BY 1, 2) c
      LEFT JOIN (SELECT session_section_id, ANY_VALUE(session_id) AS sid FROM \`${ref}\` WHERE evaluation_type = 'SCHEDULE' GROUP BY 1) q ON q.session_section_id = c.s
      LEFT JOIN (SELECT session_section_id, ANY_VALUE(${KEY("session_title")}) AS tk FROM ${SC} GROUP BY 1) sch ON sch.session_section_id = c.s
    ),
    ev AS (
      SELECT evaluation_id, instructor_user_id, SAFE_CAST(session_date AS DATE) AS session_date, evaluation_type, session_id, ${KEY("session_title")} AS tk,
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
    )`;
}

/** SQL condition to LEAVE OUT pre-preparedness recordings from a query on the QA view (its evaluation_id column). */
export function notPreparednessCondition(ref: string): string {
  return `IFNULL(evaluation_id, '') NOT IN (WITH ${prepCtes(ref)} SELECT DISTINCT evaluation_id FROM prep WHERE evaluation_id IS NOT NULL)`;
}
