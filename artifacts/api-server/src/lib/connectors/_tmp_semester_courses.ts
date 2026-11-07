// One-off, READ-ONLY (2026-11-07, per request: "do we have an idea of which subjects come in semester 2 and semester 4?").
// FCC stores no semester -> course list, but the session schedule has, per session, the batch (-> NIAT cohort) and the semester course
// ("Quantitative Aptitude - II") + course category. This prints, per cohort, every semester course with its first / last session date,
// completed and upcoming sessions and number of instructors -- so we can read off:
//   - what cohort 2025 had in its semester 2 and cohort 2024 in its semester 4 (last year's history), and
//   - whether semester 2 (cohort 2026) / semester 4 (cohort 2025) courses are already scheduled (upcoming sessions).
// It also lists any schedule column whose name mentions semester / term / year. No staff names printed. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_semester_courses.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE, getSchema, cohortForBatch } from "./instructorContribution";

async function main() {
  const schema = await getSchema(SESSION_SCHEDULE_TABLE);
  const cols = schema.map(([n]) => n);
  console.log("Schedule columns about semester / term / year / course:");
  for (const [n, t] of schema) if (/sem|term|year|course|category|curric/i.test(n)) console.log(`  ${n} (${t})`);
  const semNum = cols.find((c) => /^semester(_number|_no|_num)?$|semester_id|semester_name/i.test(c) && c !== "semester_course_title");
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const [rows] = await bq.query({
    query: `SELECT batch_name AS b,
              IFNULL(CAST(semester_course_title AS STRING), '(none)') AS sc,
              IFNULL(CAST(course_category AS STRING), '(none)') AS cat,
              ${semNum ? `CAST(${semNum} AS STRING)` : "NULL"} AS sem,
              CAST(MIN(DATE(session_start_datetime)) AS STRING) AS first_d,
              CAST(MAX(DATE(session_start_datetime)) AS STRING) AS last_d,
              COUNTIF(session_status = 'COMPLETED') AS done,
              COUNTIF(session_start_datetime > CURRENT_DATETIME() AND session_status != 'CANCELLED') AS upcoming,
              ARRAY_AGG(DISTINCT instructor_user_id IGNORE NULLS) AS uids
            FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\`
            WHERE batch_name IS NOT NULL AND session_type IN ('LECTURE', 'PRACTICE')
            GROUP BY 1, 2, 3, 4`,
  });
  type Agg = { cohort: string; sc: string; cat: string; sem: string; first: string; last: string; done: number; upcoming: number; uids: Set<string> };
  const agg = new Map<string, Agg>();
  for (const r of rows as Record<string, any>[]) {
    const cohort = cohortForBatch(String(r.b));
    if (!cohort) continue;
    const k = `${cohort}|${r.sc}|${r.cat}|${r.sem ?? ""}`;
    const a = agg.get(k) ?? { cohort, sc: r.sc, cat: r.cat, sem: r.sem ?? "", first: r.first_d, last: r.last_d, done: 0, upcoming: 0, uids: new Set<string>() };
    if (r.first_d < a.first) a.first = r.first_d;
    if (r.last_d > a.last) a.last = r.last_d;
    a.done += Number(r.done); a.upcoming += Number(r.upcoming);
    for (const u of r.uids ?? []) a.uids.add(String(u));
    agg.set(k, a);
  }
  console.log(`\ncohort | ${semNum ? "semester | " : ""}category | semester course | first session | last session | completed | upcoming | instructors`);
  for (const a of [...agg.values()].sort((x, y) => x.cohort.localeCompare(y.cohort) || x.first.localeCompare(y.first) || x.cat.localeCompare(y.cat))) {
    if (a.done + a.upcoming < 20) continue; // skip stray one-off sessions
    console.log(`${a.cohort} | ${semNum ? a.sem + " | " : ""}${a.cat} | ${a.sc} | ${a.first} | ${a.last} | ${a.done} | ${a.upcoming} | ${a.uids.size}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
