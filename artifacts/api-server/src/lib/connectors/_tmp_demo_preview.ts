// One-off, READ-ONLY (2026-10-28): preview of the new "Demos" view before publishing. Runs fetchDemoCourseRows() live (current code) and
// prints, per course: instructors with a demo, lectures covered, average QA score; plus how many completed DEMO rows matched a lecture of
// the list by topic name, and the most common topic names that did NOT match (to add to the lecture list if needed). No staff names.
//   pnpm exec tsx src/lib/connectors/_tmp_demo_preview.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { fetchDemoCourseRows, demoNameKey, QA_RATING_VIEW } from "./demoTraining";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const people = await db.select().from(instructorsTable);
  const subj = new Map(people.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, (normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) as string | null) ?? null]));
  const rows = await fetchDemoCourseRows(subj);
  console.log(`Rows (instructor x course): ${rows.length}, instructors: ${new Set(rows.map((r) => r.instructor_user_id)).size}\n`);
  console.log("Course | subject | instructors | avg lectures demoed / total | avg QA score");
  for (const c of LECTURE_COURSES) {
    const rs = rows.filter((r) => r.course_key === c.key);
    if (!rs.length) { console.log(`  ${c.title} | ${c.subject} | 0`); continue; }
    const sc = rs.reduce((a, r) => a + r.scored, 0), sum = rs.reduce((a, r) => a + r.score_sum, 0);
    console.log(`  ${c.title} | ${c.subject} | ${rs.length} | ${(rs.reduce((a, r) => a + r.lectures_demoed, 0) / rs.length).toFixed(1)} / ${c.lectures.length} | ${sc ? (sum / sc).toFixed(2) : "-"}`);
  }
  const names = new Set<string>();
  for (const c of LECTURE_COURSES) for (const l of c.lectures) for (const p of [l.name, ...l.name.split(/\s*\(\+\s*/).map((x) => x.replace(/\)\s*$/, ""))]) names.add(demoNameKey(p));
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [t] = await bq.query({ query: `SELECT session_title AS t, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS p FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\`
    WHERE evaluation_type = 'DEMO' AND LOWER(status) = 'completed' GROUP BY 1` });
  const T = t as Record<string, unknown>[];
  const total = T.reduce((a, r) => a + Number(plain(r.n)), 0);
  const un = T.filter((r) => !names.has(demoNameKey(plain(r.t)))).sort((a, b) => Number(plain(b.n)) - Number(plain(a.n)));
  const unN = un.reduce((a, r) => a + Number(plain(r.n)), 0);
  console.log(`\nCompleted DEMO rows: ${total}; matched to a lecture: ${total - unN} (${Math.round(((total - unN) / total) * 100)}%); not matched: ${unN} in ${un.length} topic names.`);
  console.log("Top topic names not matched (demos | instructors):");
  for (const r of un.slice(0, 40)) console.log(`  ${plain(r.t)} | ${plain(r.n)} | ${plain(r.p)}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
