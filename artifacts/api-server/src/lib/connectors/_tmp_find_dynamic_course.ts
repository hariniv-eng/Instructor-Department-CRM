// One-off, READ-ONLY (2026-10-16, per request: "in Frontend we have a course named Dynamic Applications -- don't we have its training
// data?"). The Training Stats Frontend track has no Dynamic course column. This lists every course in the unit-completion view whose
// title mentions "dynamic" (case-insensitive), with its course id and how many instructors have rows for it, so the right one can be
// added to trainingCourseTaxonomy.ts. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_find_dynamic_course.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE, getSchema } from "./instructorLearningStatus";

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ref = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${UNIT_COMPLETION_TABLE}`;
  const columns = (await getSchema(UNIT_COMPLETION_TABLE)).map(([name]) => name);
  const idCol = columns.find((c) => /^course_id$/i.test(c)) ?? columns.find((c) => /course.*id/i.test(c)) ?? null;
  console.log(`View: ${ref}\nCourse id column: ${idCol ?? "(none)"}\n`);
  const query = `
    SELECT course_title, ${idCol ? `CAST(${idCol} AS STRING)` : "NULL"} AS course_id,
           COUNT(DISTINCT instructor_user_id) AS instructors, COUNT(*) AS unit_rows
    FROM \`${ref}\`
    WHERE LOWER(course_title) LIKE '%dynamic%'
    GROUP BY course_title, course_id
    ORDER BY instructors DESC`;
  const [rows] = await bq.query({ query });
  if (!rows.length) console.log('No course title contains "dynamic" in this view.');
  for (const r of rows as Record<string, unknown>[]) console.log(`${JSON.stringify(r.course_title)} | course id ${r.course_id ?? "-"} | ${r.instructors} instructors | ${r.unit_rows} unit rows`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
