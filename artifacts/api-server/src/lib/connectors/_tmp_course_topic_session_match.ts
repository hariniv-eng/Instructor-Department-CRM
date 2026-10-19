// One-off, READ-ONLY (2026-10-19). Follow-up to _tmp_session_id_match.ts: session ids do NOT link to training topic/unit ids, but
// the session's learning_portal_course_id IS the training table's course_id (127 of 128 teaching courses). So each course taught
// to students also exists in the training table with its own topics and units. This checks, per teaching course, how many of
// that SAME course's topics are matched by the titles of completed Lecture/Practice sessions taught under it -- a session title
// counts for a topic when it equals (lower case, letters/digits only) the topic's title or the title of one of the topic's units.
// Topics that are clearly not taught in class (assignments, mock tests, quizzes/exams, interview prep, projects) are left out.
// Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_course_topic_session_match.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { TEACHING_COURSE_SUBJECTS } from "../../data/teachingCourseSubjects";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const show = (v: unknown) => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
export const NOT_TAUGHT_TOPIC = /assignment|mock|quiz|exam|interview|question bank|assessment|project|^learn$|cheat ?sheet|revision/i;

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const cid = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;
  const [sess] = await bq.query({
    query: `SELECT ${cid("learning_portal_course_id")} AS cid, ANY_VALUE(learning_portal_course_title) AS course, session_title,
                   COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS ins
            FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\`
            WHERE session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE') AND session_title IS NOT NULL AND learning_portal_course_id IS NOT NULL
            GROUP BY 1, 3`,
  });
  const ids = [...new Set((sess as Record<string, unknown>[]).map((r) => show(r.cid)))];
  const [units] = await bq.query({
    query: `SELECT ${cid("course_id")} AS cid, topic_id, ANY_VALUE(topic_title) AS topic, MIN(course_unit_order) AS ord, ARRAY_AGG(DISTINCT IFNULL(unit_title, '')) AS unit_titles
            FROM \`${ds}.${UNIT_COMPLETION_TABLE}\` WHERE ${cid("course_id")} IN UNNEST(@ids) GROUP BY 1, 2`,
    params: { ids },
  });
  type C = { course: string; sessions: Map<string, { title: string; n: number }>; topics: { title: string; ord: number; keys: Set<string> }[] };
  const courses = new Map<string, C>();
  for (const r of sess as Record<string, unknown>[]) {
    const k = show(r.cid);
    if (!courses.has(k)) courses.set(k, { course: show(r.course), sessions: new Map(), topics: [] });
    const t = show(r.session_title);
    courses.get(k)!.sessions.set(norm(t), { title: t, n: Number(show(r.n)) });
  }
  for (const r of units as Record<string, unknown>[]) {
    const c = courses.get(show(r.cid));
    const t = show(r.topic);
    if (!c || !t || NOT_TAUGHT_TOPIC.test(t)) continue;
    const keys = new Set([norm(t), ...((r.unit_titles as unknown[]) ?? []).map((u) => norm(show(u))).filter(Boolean)]);
    c.topics.push({ title: t, ord: Number(show(r.ord)), keys });
  }
  let T = 0, M = 0;
  const lines: [number, string][] = [];
  for (const [k, c] of courses) {
    if (!c.topics.length) { lines.push([-1, `  ${c.course} [${k}]: no topics in the training table`]); continue; }
    const matched = c.topics.filter((t) => [...t.keys].some((x) => c.sessions.has(x)));
    const usedSessions = new Set<string>(); for (const t of c.topics) for (const x of t.keys) if (c.sessions.has(x)) usedSessions.add(x);
    const sessTotal = [...c.sessions.values()].reduce((a, s) => a + s.n, 0);
    const sessUsed = [...usedSessions].reduce((a, x) => a + c.sessions.get(x)!.n, 0);
    T += c.topics.length; M += matched.length;
    const subject = k in TEACHING_COURSE_SUBJECTS ? (TEACHING_COURSE_SUBJECTS[k] ?? "general") : "not in teaching list";
    const missing = c.topics.filter((t) => !matched.includes(t)).sort((a, b) => a.ord - b.ord).slice(0, 4).map((t) => t.title);
    const unusedSess = [...c.sessions.entries()].filter(([x]) => !usedSessions.has(x)).sort((a, b) => b[1].n - a[1].n).slice(0, 4).map(([, s]) => s.title);
    lines.push([sessTotal, `  ${c.course} (${subject}): topics ${matched.length}/${c.topics.length} matched (${Math.round((matched.length / c.topics.length) * 100)}%) | sessions on matched titles ${Math.round((sessUsed / sessTotal) * 100)}% of ${sessTotal}` +
      (missing.length ? `\n      topics with no session: ${missing.join(" | ")}` : "") + (unusedSess.length ? `\n      session titles with no topic: ${unusedSess.join(" | ")}` : "")]);
  }
  lines.sort((a, b) => b[0] - a[0]);
  console.log(`Teaching courses: ${courses.size} | topics ${M}/${T} matched (${Math.round((M / Math.max(T, 1)) * 100)}%)\nBiggest courses first:\n`);
  for (const [, l] of lines) console.log(l);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
