// One-off, READ-ONLY (2026-11-17, per request: "which subjects have instructors given mock demos in?"). Every completed MOCK row in
// niat_session_wise_qa_rating, its topic matched to FCC's lecture lists (same matching as Training - Demos) -> subject. Per subject: MOCK
// recordings, instructors, date range. Topics in several subjects are shown as "A / B"; topics matching no lecture are listed (top 25)
// so they can be placed by hand. Optional employee ID: that instructor's MOCKs per subject. Counts and titles only.
//   pnpm exec tsx src/lib/connectors/_tmp_mock_subjects.ts [EMPLOYEE_ID]
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { QA_RATING_VIEW, lectureNameIndex, matchDemoTopic } from "./demoTraining";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  let uid: string | null = null;
  if (emp) { const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp)); uid = p?.teachosUserId ?? null; if (!uid) { console.log(`${emp}: no TeachOS id`); process.exit(0); } }
  const [rows] = await bq.query({ query: `SELECT instructor_user_id u, session_title t, CAST(session_date AS STRING) d, SAFE_CAST(final_score AS FLOAT64) s
      FROM \`${P}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\` WHERE evaluation_type = 'MOCK' AND UPPER(status) = 'COMPLETED'${uid ? " AND instructor_user_id = @u" : ""}`,
    params: uid ? { u: uid } : {} });
  const idx = lectureNameIndex();
  const agg = new Map<string, { n: number; people: Set<string>; lo: string; hi: string; sum: number; scored: number; courses: Map<string, number> }>();
  const unmatched = new Map<string, number>();
  for (const r of rows as Record<string, unknown>[]) {
    const hits = matchDemoTopic(idx, plain(r.t));
    const subjects = [...new Set((hits ?? []).map((h) => LECTURE_COURSES[h.ci].subject))].sort();
    const key = subjects.length ? subjects.join(" / ") : "No lecture match";
    if (!subjects.length) unmatched.set(plain(r.t), (unmatched.get(plain(r.t)) ?? 0) + 1);
    const d = plain(r.d).slice(0, 10);
    const a = agg.get(key) ?? { n: 0, people: new Set<string>(), lo: d, hi: d, sum: 0, scored: 0, courses: new Map<string, number>() };
    a.n++; a.people.add(plain(r.u)); if (d && d < a.lo) a.lo = d; if (d > a.hi) a.hi = d;
    if (r.s !== null && plain(r.s) !== "") { a.sum += Number(plain(r.s)); a.scored++; }
    for (const c of new Set((hits ?? []).map((h) => LECTURE_COURSES[h.ci].title))) a.courses.set(c, (a.courses.get(c) ?? 0) + 1);
    agg.set(key, a);
  }
  console.log(`${emp ? `${emp}: ` : ""}MOCK recordings (completed): ${(rows as unknown[]).length}\n`);
  console.log("Subject | recordings | instructors | from .. to | avg score | courses");
  for (const [k, a] of [...agg].sort((x, y) => y[1].n - x[1].n))
    console.log(`  ${k} | ${a.n} | ${a.people.size} | ${a.lo} .. ${a.hi} | ${a.scored ? Math.round((a.sum / a.scored) * 10) / 10 : "-"} | ${[...a.courses].sort((x, y) => y[1] - x[1]).map(([c, n]) => `${c} ${n}`).join(", ") || "-"}`);
  if (unmatched.size) {
    console.log(`\nTopics that match no lecture (${unmatched.size} different titles), top 25:`);
    for (const [t, n] of [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n} x ${t}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
