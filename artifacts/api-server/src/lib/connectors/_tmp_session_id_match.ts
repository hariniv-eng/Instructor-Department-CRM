// One-off, READ-ONLY (2026-10-19, per request: "can we match sessions using the session id"). Checks whether the session view's
// session_id (one id per curriculum session, shared by every section that takes it) is the same id as a topic_id or unit_id in the
// training unit-completion table -- if so, taught sessions link to training topics exactly, with no name matching. Also tries
// session_section_id and semester_course_id against course/topic/unit ids, ignoring hyphens and case. Writes nothing.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_session_id_match.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

const show = (v: unknown) => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const id = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;
  const sessionCols = ["session_id", "session_section_id", "semester_course_id", "learning_portal_course_id"];
  const unitCols = ["course_id", "topic_id", "unit_id"];
  console.log("How many DISTINCT ids of each session column also appear as each training-table id:\n");
  for (const s of sessionCols) {
    for (const u of unitCols) {
      const [[r]] = await bq.query({
        query: `WITH s AS (SELECT DISTINCT ${id(s)} AS k FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\` WHERE ${s} IS NOT NULL),
                     u AS (SELECT DISTINCT ${id(u)} AS k FROM \`${ds}.${UNIT_COMPLETION_TABLE}\` WHERE ${u} IS NOT NULL)
                SELECT (SELECT COUNT(*) FROM s) AS session_ids, (SELECT COUNT(*) FROM u) AS training_ids, COUNT(*) AS shared
                FROM s JOIN u USING (k)`,
      });
      console.log(`  ${s} vs ${u}: ${show((r as Record<string, unknown>).shared)} shared (of ${show((r as Record<string, unknown>).session_ids)} session ids, ${show((r as Record<string, unknown>).training_ids)} training ids)`);
    }
  }
  // Examples of any session_id that matches a topic or unit, so we can see what it lines up with.
  const [ex] = await bq.query({
    query: `WITH s AS (SELECT ${id("session_id")} AS k, ANY_VALUE(session_title) AS session_title, ANY_VALUE(learning_portal_course_title) AS teaching_course
                       FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\` GROUP BY 1),
                 u AS (SELECT ${id("topic_id")} AS k, 'topic_id' AS matched_on, ANY_VALUE(course_title) AS training_course, ANY_VALUE(topic_title) AS topic, ANY_VALUE(unit_title) AS unit, ANY_VALUE(unit_type) AS unit_type
                       FROM \`${ds}.${UNIT_COMPLETION_TABLE}\` GROUP BY 1
                       UNION ALL
                       SELECT ${id("unit_id")}, 'unit_id', ANY_VALUE(course_title), ANY_VALUE(topic_title), ANY_VALUE(unit_title), ANY_VALUE(unit_type)
                       FROM \`${ds}.${UNIT_COMPLETION_TABLE}\` GROUP BY 1)
            SELECT * FROM s JOIN u USING (k) LIMIT 15`,
  });
  console.log(`\nExamples of session_id matches (${ex.length}):`);
  for (const r of ex as Record<string, unknown>[]) console.log(`  ${show(r.session_title)} [${show(r.teaching_course)}] -> ${show(r.matched_on)}: ${show(r.training_course)} / ${show(r.topic)} / ${show(r.unit)} (${show(r.unit_type)})`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
