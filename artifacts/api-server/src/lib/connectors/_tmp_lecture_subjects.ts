// One-off, READ-ONLY (2026-11-21, per request: "the 21 Semester 1 instructors with no score -- what subject are they actually teaching,
// from the last 30 days' LECTURE sessions; and how many are instructors vs mentors"). For the employee IDs given (default: the 21 rows
// left unscored in the semester-fit report): completed LECTURE sessions in the last 30 days per course and subject (course -> subject
// as in Taught in Class), NIAT cohorts of those lectures' batches, their Lecture / Practice / Other session counts (role by sessions,
// Contribution rule: Instructor if any Lecture, Mentor if sessions but no Lecture), the FCC team, mapped subject and Contribution's
// "Subject from sessions" (Lecture + Practice). Employee IDs only.
//   pnpm exec tsx src/lib/connectors/_tmp_lecture_subjects.ts [NW... NW...]
import { BigQuery } from "@google-cloud/bigquery";
import { gte } from "drizzle-orm";
import { db, instructorsTable, instructorContributionTable, instructorContributionDailyTable } from "@workspace/db";
import { config } from "./config";
import { normUid } from "./topinAssessments";
import { taughtSubjectColumn } from "./taughtTraining";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const DEFAULT = "NW0002993,NW0004567,NW0004066,NW0002998,NW0007919,NW0006962,NW0007802,NW0007860,NW0005496,NW0007252,NW2000385,NW2000319,NW0005550,NW0007582,NW2000557,NW0004077,NW2000409,NW2000304,NW2000574,NW2000438,NW2000297".split(",");
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const args = process.argv.slice(2).filter((a) => /^NW\d{7}$/i.test(a)).map((a) => a.toUpperCase());
  const ids = args.length ? args : DEFAULT;
  const people = (await db.select().from(instructorsTable)).filter((p) => p.employeeId && ids.includes(p.employeeId));
  const uids = people.filter((p) => p.teachosUserId).map((p) => normUid(p.teachosUserId!));
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [normUid(c.instructorUserId), c]));
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const sess = new Map<string, { l: number; p: number; o: number }>();
  for (const d of await db.select().from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, since))) {
    const k = normUid(d.instructorUserId); const x = sess.get(k) ?? { l: 0, p: 0, o: 0 }; x.l += d.lectureSessions; x.p += d.practiceSessions; x.o += d.otherSessions; sess.set(k, x);
  }
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  // Column names found the same way as fetchSessionSubjects (2026-11-21: the table has no plain course_id column).
  const [colRows] = await bq.query({ query: `SELECT column_name FROM \`${P}.${config.BIGQUERY_DATASET}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t`, params: { t: SESSION_SCHEDULE_TABLE } });
  const cols = (colRows as Record<string, unknown>[]).map((r) => plain(r.column_name));
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c));
  const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c));
  const batchCol = cols.find((c) => /^batch_name$/i.test(c)) ?? cols.find((c) => /batch.*name/i.test(c));
  console.error(`schedule columns used: course id ${idCol ?? "-"}, course title ${titleCol ?? "-"}, batch ${batchCol ?? "-"}`);
  const [rows] = await bq.query({ query: `SELECT instructor_user_id AS u, ${idCol ? `REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '')` : "''"} AS cid, ${titleCol ? `CAST(${titleCol} AS STRING)` : "''"} AS t,
      COUNT(*) AS n, MAX(CAST(session_start_datetime AS STRING)) AS last, ${batchCol ? `ARRAY_AGG(DISTINCT CAST(${batchCol} AS STRING) IGNORE NULLS LIMIT 5)` : "[]"} AS batches
    FROM \`${P}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\`
    WHERE session_status = 'COMPLETED' AND session_type = 'LECTURE' AND REPLACE(LOWER(instructor_user_id), '-', '') IN UNNEST(@u)
      AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY) AND session_start_datetime <= CURRENT_DATETIME()
    GROUP BY 1, 2, 3 ORDER BY n DESC`, params: { u: uids } });
  const lec = new Map<string, { subject: string; course: string; n: number; last: string; batches: string[] }[]>();
  for (const r of rows as Record<string, unknown>[]) {
    const k = normUid(plain(r.u));
    lec.set(k, [...(lec.get(k) ?? []), { subject: taughtSubjectColumn(plain(r.cid), plain(r.t)) ?? "General", course: plain(r.t), n: Number(plain(r.n)), last: plain(r.last).slice(0, 10), batches: ((r.batches as unknown[]) ?? []).map(plain) }]);
  }
  console.log("employee_id|fcc_team|role_by_sessions|lecture/practice/other_30d|mapped_subject|teaching_subject_by_lectures_30d|lectures_per_subject|courses (lectures, last date)|niat_cohorts|contribution_subject_from_sessions");
  for (const id of ids) {
    const p = people.find((x) => x.employeeId === id);
    if (!p?.teachosUserId) { console.log(`${id}|not in FCC / no TeachOS id`); continue; }
    const k = normUid(p.teachosUserId);
    const x = sess.get(k) ?? { l: 0, p: 0, o: 0 };
    const role = x.l > 0 ? "Instructor" : x.l + x.p + x.o > 0 ? "Mentor" : "No sessions";
    const L = lec.get(k) ?? [];
    const bySubj = new Map<string, number>(); for (const c of L) bySubj.set(c.subject, (bySubj.get(c.subject) ?? 0) + c.n);
    const ranked = [...bySubj].sort((a, b) => b[1] - a[1]);
    const c = contrib.get(k);
    console.log([id, p.classification === "mentor" ? "Mentor" : "Instructor", role, `${x.l}/${x.p}/${x.o}`, normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) ?? "(none)",
      ranked[0]?.[0] ?? "(no lectures)", ranked.map(([s, n]) => `${s} ${n}`).join("; "), L.map((c) => `${c.course} (${c.n}, ${c.last})`).join("; "),
      (c?.niatCohorts ?? []).join(", "), Object.entries(c?.sessionSubjects ?? {}).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join("; ")].join("|"));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
