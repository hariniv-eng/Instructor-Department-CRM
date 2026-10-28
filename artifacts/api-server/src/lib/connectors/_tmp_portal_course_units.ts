// One-off, READ-ONLY (2026-10-27, per request): in the LEARNING PORTAL data (niat_instructor_unit_wise_completion_and_best_attempt_details,
// the portal course structure behind Training Stats), find the course with the IPS course ID, list all its topics and units with unit IDs
// in portal order, and check them against the IPS lecture list (48 lectures from the prod sequence):
//   - each portal unit: is it an IPS lecture unit (and which #), or not
//   - each IPS lecture: is its unit ID in this course / anywhere in the portal (which course) / only a unit with the same title
// No staff names. Writes portal_course_units.csv (no staff data).
//   pnpm exec tsx src/lib/connectors/_tmp_portal_course_units.ts                (IPS course id c51b2ebf-...)
//   pnpm exec tsx src/lib/connectors/_tmp_portal_course_units.ts 9e370332-c9dd-4778-9e65-e5d7f75c24f3   (any course id)
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import { config } from "./config";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const nameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const N = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;
async function main() {
  const cid = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "c51b2ebf-d646-4680-b868-e731110ef183").toLowerCase().replace(/-/g, "");
  const ips = LECTURE_COURSES.find((c) => c.key === "lecture_ips")!;
  const ipsUnit = new Map<string, number>(); ips.lectures.forEach((l) => l.unitIds.forEach((u) => ipsUnit.set(u, l.n)));
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const P = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.niat_instructor_unit_wise_completion_and_best_attempt_details\``;

  const [courses] = await bq.query({ query: `
    SELECT course_id, ANY_VALUE(course_title) AS t, COUNT(DISTINCT unit_id) AS units, COUNT(DISTINCT instructor_user_id) AS ins FROM ${P}
    WHERE ${N("course_id")} = @cid OR REGEXP_CONTAINS(LOWER(IFNULL(course_title, '')), r'\\bips\\b|sem 4|sem4|phase 4|greedy|dynamic programming|graph')
    GROUP BY 1 ORDER BY 4 DESC`, params: { cid } });
  console.log("Portal courses with this ID or an IPS-like title (course id | title | units | instructors):");
  for (const r of courses as Record<string, unknown>[]) console.log(`  ${plain(r.course_id)}${plain(r.course_id).replace(/-/g, "").toLowerCase() === cid ? "  <== this ID" : ""} | ${plain(r.t)} | ${plain(r.units)} | ${plain(r.ins)}`);

  const [units] = await bq.query({ query: `
    SELECT ANY_VALUE(topic_title) AS topic, unit_id, ANY_VALUE(unit_title) AS ut, ANY_VALUE(unit_type) AS ty, MIN(course_unit_order) AS ord,
           COUNT(DISTINCT instructor_user_id) AS ins FROM ${P} WHERE ${N("course_id")} = @cid GROUP BY unit_id ORDER BY ord`, params: { cid } });
  const U = units as Record<string, unknown>[];
  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const out = [["Order", "Topic", "Unit title", "Unit type", "Unit ID", "Instructors", "IPS lecture #"].join(",")];
  console.log(`\nUnits of course ${cid} in the portal: ${U.length} (order | topic | unit | type | unit id | instructors | IPS lecture #)`);
  for (const r of U) {
    const n = ipsUnit.get(plain(r.unit_id).replace(/-/g, "").toLowerCase());
    console.log(`  ${plain(r.ord)} | ${plain(r.topic)} | ${plain(r.ut)} | ${plain(r.ty)} | ${plain(r.unit_id)} | ${plain(r.ins)} | ${n ? `IPS #${n}` : "-"}`);
    out.push([plain(r.ord), plain(r.topic), plain(r.ut), plain(r.ty), plain(r.unit_id), plain(r.ins), n ? `IPS #${n}` : ""].map(esc).join(","));
  }
  fs.writeFileSync("portal_course_units.csv", out.join("\n"));

  const [where] = await bq.query({ query: `
    SELECT ${N("unit_id")} AS u, ANY_VALUE(course_id) AS c, ANY_VALUE(course_title) AS t FROM ${P} WHERE ${N("unit_id")} IN UNNEST(@units) GROUP BY 1`,
    params: { units: [...ipsUnit.keys()] } });
  const W = new Map((where as Record<string, unknown>[]).map((r) => [plain(r.u), r]));
  const [byName] = await bq.query({ query: `
    SELECT REGEXP_REPLACE(REPLACE(LOWER(unit_title), '&', 'and'), r'[^a-z0-9]', '') AS k, unit_id, ANY_VALUE(course_title) AS t, ANY_VALUE(course_id) AS c
    FROM ${P} WHERE REGEXP_REPLACE(REPLACE(LOWER(unit_title), '&', 'and'), r'[^a-z0-9]', '') IN UNNEST(@names) GROUP BY 1, 2`,
    params: { names: ips.lectures.map((l) => nameKey(l.name)) } });
  const B = byName as Record<string, unknown>[];
  let inCourse = 0, inPortal = 0;
  console.log(`\nIPS lecture list (48) vs the portal:`);
  for (const l of ips.lectures) {
    const u = l.unitIds[0];
    const w = W.get(u);
    const here = U.some((r) => plain(r.unit_id).replace(/-/g, "").toLowerCase() === u);
    if (here) inCourse++; if (w) inPortal++;
    const same = B.filter((r) => plain(r.k) === nameKey(l.name) && plain(r.unit_id).replace(/-/g, "").toLowerCase() !== u);
    console.log(`  #${l.n} ${l.name}: ${here ? "IN THIS COURSE" : w ? `in another course: ${plain(w.t)} (${plain(w.c)})` : "unit ID NOT in the portal"}` +
      (same.length ? `  | same title, other unit: ${same.map((r) => `${plain(r.unit_id)} (${plain(r.t)})`).join("; ")}` : ""));
  }
  console.log(`\nSummary: ${inCourse} / 48 IPS unit IDs are in course ${cid}; ${inPortal} / 48 are anywhere in the portal data. Units listed in portal_course_units.csv.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
