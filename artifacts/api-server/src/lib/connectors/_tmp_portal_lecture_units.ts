// One-off, READ-ONLY (2026-10-26). Builds a draft lecture list straight from the learning portal data in BigQuery, for every
// course -- especially the ones we have no prod-sequence sheet for. A "lecture unit" here = a LEARNING_SET unit (not reading
// material / cheat sheet / quiz / practice) that has actually been scheduled as a LECTURE session at least once. Unit IDs come
// from the portal course structure (niat_instructor_unit_wise_completion_and_best_attempt_details), order from course_unit_order.
// Marks which units are already in src/data/lecture_sessions_master.csv. Writes portal_lecture_units.csv (no staff data).
//   pnpm exec tsx src/lib/connectors/_tmp_portal_lecture_units.ts [minTimesScheduled=3]
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";

const minTimes = Number(process.argv[2] ?? 3);
const NOT_LECTURE = /reading material|study material|cheat ?sheet|classroom quiz|class room quiz|\bquiz\b|mcq|coding practice|practice|tutorial \||revision|assessment|exam/i;
const norm = (id: string | null | undefined) => (id ?? "").replace(/-/g, "").toLowerCase();

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const master = fs.readFileSync(path.join(here, "../../data/lecture_sessions_master.csv"), "utf8");
  const inMaster = new Set((master.match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi) ?? []).map(norm));

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const [rows] = await bq.query({ query: `
    WITH units AS (
      SELECT unit_id, ANY_VALUE(course_title) AS course_title, STRING_AGG(DISTINCT course_id, ' ; ') AS course_ids, ANY_VALUE(topic_title) AS topic_title,
             ANY_VALUE(unit_title) AS unit_title, ANY_VALUE(unit_type) AS unit_type, MIN(course_unit_order) AS ord
      FROM \`${ds}.niat_instructor_unit_wise_completion_and_best_attempt_details\` GROUP BY unit_id),
    sched AS (
      SELECT REPLACE(LOWER(resource_id), '-', '') AS uid, ANY_VALUE(learning_portal_course_title) AS sched_course, COUNT(DISTINCT session_id) AS times
      FROM \`${ds}.niat_scheduled_session_wise_resource_details\`
      WHERE UPPER(session_type) = 'LECTURE' AND resource_id IS NOT NULL GROUP BY 1)
    SELECT COALESCE(u.course_title, s.sched_course) AS course_title, u.course_ids, u.topic_title, u.unit_title, u.unit_type, u.ord, u.unit_id, s.uid, s.times
    FROM sched s LEFT JOIN units u ON REPLACE(LOWER(u.unit_id), '-', '') = s.uid
    WHERE s.times >= @minTimes`, params: { minTimes } });
  type R = { course_title: string; course_ids: string; topic_title: string; unit_title: string; unit_type: string; ord: number; unit_id: string; uid: string; times: number };
  const lect = (rows as R[]).filter((r) => r.unit_title && (r.unit_type ?? "").toUpperCase() === "LEARNING_SET" && !NOT_LECTURE.test(r.unit_title));

  const byCourse = new Map<string, R[]>();
  for (const r of lect) { const k = r.course_title ?? "(unknown)"; byCourse.set(k, [...(byCourse.get(k) ?? []), r]); }
  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const out = [["Portal course", "Course ID(s)", "Order", "Topic", "Unit title", "Unit ID", "Times scheduled as lecture", "Already in master list"].join(",")];
  console.log(`Lecture units scheduled at least ${minTimes}x, by portal course (in master list / total):\n`);
  for (const [c, list] of [...byCourse].sort((a, b) => b[1].length - a[1].length)) {
    list.sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
    const have = list.filter((r) => inMaster.has(norm(r.uid))).length;
    console.log(`  ${c}: ${have} / ${list.length}${have === 0 ? "   <-- not in master list" : have < list.length ? "   <-- some missing" : ""}`);
    for (const r of list) out.push([c, r.course_ids, r.ord, r.topic_title, r.unit_title, r.unit_id, r.times, inMaster.has(norm(r.uid)) ? "yes" : "no"].map(esc).join(","));
  }
  fs.writeFileSync("portal_lecture_units.csv", out.join("\n"));
  console.log(`\nWritten to portal_lecture_units.csv (${out.length - 1} units, no staff data).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
