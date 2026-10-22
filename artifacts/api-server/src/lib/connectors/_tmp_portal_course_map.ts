// One-off, READ-ONLY (2026-10-19): shows how every campus course (NIAT, Lecture/Practice) is matched to a learning-portal course
// by content (matchToPortalCourses in taughtTraining.ts) -- the mapping the "Taught in class" columns use -- grouped by portal course,
// then the campus courses that matched none. Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_portal_course_map.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { matchToPortalCourses, taughtSubjectColumn } from "./taughtTraining";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const cid = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;
  const match = await matchToPortalCourses(bq, ds, cid);
  const [rows] = await bq.query({
    query: `SELECT ${cid("learning_portal_course_id")} AS cid, ANY_VALUE(learning_portal_course_title) AS title, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS ins,
                   STRING_AGG(DISTINCT institute_name, ', ' LIMIT 4) AS campuses
            FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\`
            WHERE institute_type = 'NIAT_OFFLINE' AND session_type IN ('LECTURE', 'PRACTICE') AND learning_portal_course_id IS NOT NULL
            GROUP BY 1 ORDER BY n DESC`,
  });
  const list = (rows as { cid: string; title: string; n: number; ins: number; campuses: string }[]);
  for (const def of TRAINING_COURSE_TAXONOMY) {
    const hits = list.filter((r) => match.get(r.cid)?.key === def.key);
    console.log(`\n[${def.trackGroup}] ${def.label}: ${hits.length} campus course(s)`);
    for (const r of hits) console.log(`    ${r.title} [${r.cid}] -- ${match.get(r.cid)!.pct}% of its session titles found | ${r.n} sessions, ${r.ins} instructors | ${r.campuses ?? ""}`);
  }
  const none = list.filter((r) => !match.has(r.cid));
  console.log(`\nNO learning-portal match (keep their own column, grouped by name; orientation ones are left out): ${none.length}`);
  for (const r of none) console.log(`    ${r.title} [${r.cid}] (${taughtSubjectColumn(r.cid, r.title) ?? "orientation - left out"}) | ${r.n} sessions, ${r.ins} instructors | ${r.campuses ?? ""}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
