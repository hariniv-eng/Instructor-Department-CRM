// One-off, READ-ONLY (2026-11-27, per request: "can you get the access for this course_id = 3b6305a6-ceab-4483-a02d-57b599d61a19").
// Looks for one course ID (with or without dashes) in every BigQuery table FCC reads that has a course ID column:
//   - niat_schedule_details_as_per_prod_sequence (semester_course_id): title, category, semesters, batches, lecture / practice / exam counts
//   - the learning-portal unit table (course_id): title, topics, units by type, how many instructors have it; then its units in order
//   - the session schedule table (any *course*id* column): title, sessions
// No people printed. Writes course_units.csv (the portal units of that course, no people) when it is in the portal.
//   pnpm exec tsx src/lib/connectors/_tmp_find_course_id.ts 3b6305a6-ceab-4483-a02d-57b599d61a19
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const N = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;
const csv = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

async function main() {
  const raw = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "3b6305a6-ceab-4483-a02d-57b599d61a19").trim();
  const cid = raw.replace(/-/g, "").toLowerCase();
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = (t: string) => `\`${P}.${DS}.${t}\``;
  console.log(`Course ID ${raw}`);

  console.log("\n1. Prod sequence schedule (niat_schedule_details_as_per_prod_sequence, semester_course_id)");
  const [ps] = await bq.query({ query: `SELECT ANY_VALUE(course_title) AS t, ANY_VALUE(course_category) AS cat, STRING_AGG(DISTINCT semester_title, ', ') AS sems,
      COUNT(DISTINCT batch_name) AS batches, STRING_AGG(DISTINCT batch_name, '; ' LIMIT 8) AS bl,
      COUNT(DISTINCT IF(session_type = 'LECTURE', session_id, NULL)) AS lec, COUNTIF(session_type = 'PRACTICE') AS pr, COUNTIF(session_type = 'EXAM') AS ex, COUNT(*) AS n
    FROM ${T("niat_schedule_details_as_per_prod_sequence")} WHERE ${N("semester_course_id")} = @c`, params: { c: cid } });
  const p0 = (ps as Record<string, unknown>[])[0];
  console.log(Number(plain(p0?.n)) ? `   FOUND: ${plain(p0.t)} | ${plain(p0.cat)} | ${plain(p0.sems)} | ${plain(p0.batches)} batches (${plain(p0.bl)}) | lectures ${plain(p0.lec)}, practice ${plain(p0.pr)}, exams ${plain(p0.ex)}` : "   not found");

  console.log(`\n2. Learning portal (${UNIT_COMPLETION_TABLE}, course_id)`);
  const [lp] = await bq.query({ query: `SELECT ANY_VALUE(course_title) AS t, COUNT(DISTINCT topic_title) AS topics, COUNT(DISTINCT unit_id) AS units,
      COUNT(DISTINCT instructor_user_id) AS ins, COUNT(*) AS n FROM ${T(UNIT_COMPLETION_TABLE)} WHERE ${N("course_id")} = @c`, params: { c: cid } });
  const l0 = (lp as Record<string, unknown>[])[0];
  if (!Number(plain(l0?.n))) console.log("   not found");
  else {
    console.log(`   FOUND: ${plain(l0.t)} | ${plain(l0.units)} units in ${plain(l0.topics)} topics | ${plain(l0.ins)} instructors have it`);
    const [units] = await bq.query({ query: `SELECT ANY_VALUE(topic_title) AS topic, unit_id, ANY_VALUE(unit_title) AS ut, ANY_VALUE(unit_type) AS ty, MIN(course_unit_order) AS ord,
        COUNT(DISTINCT instructor_user_id) AS ins FROM ${T(UNIT_COMPLETION_TABLE)} WHERE ${N("course_id")} = @c GROUP BY unit_id ORDER BY ord`, params: { c: cid } });
    const U = units as Record<string, unknown>[];
    const types = new Map<string, number>(); for (const u of U) types.set(plain(u.ty), (types.get(plain(u.ty)) ?? 0) + 1);
    console.log(`   unit types: ${[...types].map(([k, v]) => `${k} ${v}`).join(", ")}`);
    let topic = "";
    for (const u of U) { if (plain(u.topic) !== topic) { topic = plain(u.topic); console.log(`   -- ${topic}`); } console.log(`      ${plain(u.ord)}. ${plain(u.ut)} [${plain(u.ty)}] ${plain(u.unit_id)}`); }
    fs.writeFileSync("course_units.csv", [["order", "topic", "unit_title", "unit_type", "unit_id", "instructors"].join(","), ...U.map((u) => [plain(u.ord), plain(u.topic), plain(u.ut), plain(u.ty), plain(u.unit_id), plain(u.ins)].map(csv).join(","))].join("\n"));
    console.log("   Wrote course_units.csv (units only, no people).");
  }

  console.log(`\n3. Session schedule (${SESSION_SCHEDULE_TABLE})`);
  const [cols] = await bq.query({ query: `SELECT column_name FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t AND REGEXP_CONTAINS(LOWER(column_name), r'course.*id')`, params: { t: SESSION_SCHEDULE_TABLE } });
  const ids = (cols as Record<string, unknown>[]).map((r) => plain(r.column_name));
  if (!ids.length) console.log("   no course id column");
  for (const c of ids) {
    const [s] = await bq.query({ query: `SELECT COUNT(*) AS n, COUNTIF(session_status = 'COMPLETED') AS done FROM ${T(SESSION_SCHEDULE_TABLE)} WHERE ${N(c)} = @c`, params: { c: cid } });
    const s0 = (s as Record<string, unknown>[])[0];
    console.log(`   ${c}: ${Number(plain(s0?.n)) ? `FOUND ${plain(s0.n)} sessions (${plain(s0.done)} completed)` : "not found"}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
