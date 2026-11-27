// One-off, READ-ONLY (2026-11-27, per request: "with these course_id's [CDU Semester 4], can we get what content we have in the learning
// portal"). For every course of one semester in the matching batches (niat_schedule_details_as_per_prod_sequence), look for the same course
// in the learning-portal data (UNIT_COMPLETION_TABLE -- the portal course structure behind Training - LP): first by course ID, then by the
// same title, then by a title containing / contained in it. For each portal course found: units, topics, unit types, how many instructors
// have it, and how many of the schedule's LECTURE titles have a portal unit with the same title. No people printed.
// Also writes lp_content_for_courses.csv (courses / units only, no people).
//   pnpm exec tsx src/lib/connectors/_tmp_lp_content_for_courses.ts [batch text, default "CDU"] [semester number, default 4]
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const key = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const idk = (s: string) => s.replace(/-/g, "").toLowerCase();
const csv = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const batch = args.find((a) => !/^\d$/.test(a)) ?? "CDU";
  const sem = `Semester ${args.find((a) => /^\d$/.test(a)) ?? "4"}`;
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [sched] = await bq.query({ query: `SELECT semester_course_id AS id, ANY_VALUE(course_title) AS t, ANY_VALUE(course_category) AS cat,
      ARRAY_AGG(DISTINCT IF(session_type = 'LECTURE', session_title, NULL) IGNORE NULLS) AS lec
    FROM \`${P}.${DS}.niat_schedule_details_as_per_prod_sequence\` WHERE semester_title = @sem AND LOWER(batch_name) LIKE LOWER(@b) GROUP BY 1 ORDER BY 3, 2`,
    params: { sem, b: `%${batch}%` } });
  const LP = `\`${P}.${DS}.${UNIT_COMPLETION_TABLE}\``;
  const [lpCourses] = await bq.query({ query: `SELECT course_id AS id, ANY_VALUE(course_title) AS t, COUNT(DISTINCT unit_id) AS units, COUNT(DISTINCT topic_title) AS topics,
      COUNT(DISTINCT instructor_user_id) AS ins, STRING_AGG(DISTINCT unit_type, ', ') AS types FROM ${LP} GROUP BY 1` });
  const lp = (lpCourses as Record<string, unknown>[]).map((r) => ({ id: plain(r.id), t: plain(r.t), units: plain(r.units), topics: plain(r.topics), ins: plain(r.ins), types: plain(r.types) }));
  const out = [["schedule_course_id", "schedule_course_title", "category", "schedule_lectures", "match", "lp_course_id", "lp_course_title", "lp_units", "lp_topics", "lp_unit_types", "lp_instructors", "lectures_with_same_title_unit"].join(",")];
  console.log(`${sem}, batches matching "${batch}": ${(sched as unknown[]).length} courses; learning-portal courses in the data: ${lp.length}`);
  for (const s of sched as Record<string, unknown>[]) {
    const id = plain(s.id), t = plain(s.t), lec = ((s.lec as unknown[]) ?? []).map(plain);
    let how = "same course ID";
    let hits = lp.filter((c) => idk(c.id) === idk(id));
    if (!hits.length) { how = "same title"; hits = lp.filter((c) => key(c.t) === key(t)); }
    if (!hits.length && key(t).length > 5) { how = "similar title"; hits = lp.filter((c) => key(c.t).includes(key(t)) || (key(c.t).length > 5 && key(t).includes(key(c.t)))); }
    console.log(`\n${id} | ${plain(s.cat)} | ${t} | ${lec.length} lectures in the schedule`);
    if (!hits.length) { console.log("   NOT in the learning-portal data (no course with this ID or title)"); out.push([id, t, plain(s.cat), lec.length, "none", "", "", "", "", "", "", ""].map(csv).join(",")); continue; }
    for (const c of hits) {
      const [u] = await bq.query({ query: `SELECT DISTINCT unit_title AS ut FROM ${LP} WHERE course_id = @c`, params: { c: c.id } });
      const unitKeys = new Set((u as Record<string, unknown>[]).map((r) => key(plain(r.ut))));
      const same = lec.filter((l) => unitKeys.has(key(l))).length;
      console.log(`   ${how}: ${c.id} | ${c.t} | ${c.units} units in ${c.topics} topics | types: ${c.types} | ${c.ins} instructors have it | ${same} / ${lec.length} lecture titles match a unit`);
      out.push([id, t, plain(s.cat), lec.length, how, c.id, c.t, c.units, c.topics, c.types, c.ins, same].map(csv).join(","));
    }
  }
  fs.writeFileSync("lp_content_for_courses.csv", out.join("\n"));
  console.log("\nWrote lp_content_for_courses.csv (courses only, no people).");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
