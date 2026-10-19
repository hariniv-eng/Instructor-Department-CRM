// "Taught in class" training (2026-10-19, per request): instead of what an instructor finished in the learning portal (Training Stats),
// how much of each course they have actually TAUGHT to students. "Many instructors have taught a subject for a whole year, so they
// know it, even if the portal shows their own course as unfinished."
//
// How it is worked out (checked with _tmp_session_id_match.ts and _tmp_course_topic_session_match.ts, 2026-10-19):
//   * Session ids do NOT link to training topic/unit ids, but the session view's learning_portal_course_id IS the training table's
//     course_id (127 of 128 courses). So every course taught to students also exists in the training table with its own topics/units.
//   * A course's topics = its topics in the training table, minus ones never taught in class (assignments, mock tests, quizzes/exams,
//     interview prep, projects...).
//   * A topic is TAUGHT by an instructor when one of their COMPLETED Lecture/Practice sessions under the SAME course has a title equal
//     (lower case, letters/digits only) to the topic's title or to one of its units' titles. Generic unit names that appear in several
//     topics ("MCQ Practice", "Coding Practice", "Reading Material"...) prove nothing about which topic was taught and are ignored.
//   * Taught % = topics taught / course topics. All time. "Completed" = 80% or more (on the page).
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { runWithHardTimeout } from "./timeout";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { SESSION_SCHEDULE_TABLE, TRACK_SUBJECT } from "./instructorContribution";
import { TEACHING_COURSE_SUBJECTS } from "../../data/teachingCourseSubjects";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";

export type TaughtCourseRow = {
  instructor_user_id: string;
  course_id: string;
  course_title: string;
  course_subject: string | null;
  topics_total: number;
  topics_taught: number;
  taught_topics: string[];
  sessions_completed: number;
  first_taught_date: string | null;
  last_taught_date: string | null;
};

// Topics that are not taught in class, left out of a course's topic count.
export const NOT_TAUGHT_TOPIC = /assignment|mock|quiz|exam|interview|question bank|assessment|project|^learn$|cheat ?sheet|revision/i;
// Unit names too generic to say which topic a session covered (checked on the normalised text).
const GENERIC_KEY = /^(mcq|mcqs|mcqpractice|codingpractice|practice|practiceset|practicesession|readingmaterial|quiz|video|ppt|assignment|cheatsheet|summary|learn|introduction|courseoverview|lab|selflearning|theoreticalconcepts)\d*$/;
const QUERY_TIMEOUT_MS = 180000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const cleanId = (s: string) => s.replace(/-/g, "").toLowerCase();

// Subject of a course: teaching-course list first (null there = a general course), then the Training Stats course list.
function courseSubjectOf(courseId: string): string | null {
  if (courseId in TEACHING_COURSE_SUBJECTS) return TEACHING_COURSE_SUBJECTS[courseId] ?? "General";
  for (const def of TRAINING_COURSE_TAXONOMY) {
    if ((def.courseIds ?? []).some((id) => cleanId(id) === courseId)) return def.key === "math_for_cs" ? "Math for Computer Science" : (TRACK_SUBJECT[def.trackGroup] ?? null);
  }
  return null;
}

export async function fetchTaughtCourseRows(): Promise<TaughtCourseRow[]> {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const cid = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;

  // 1) Every instructor's completed Lecture/Practice session titles, per course (all time).
  const [sessionRows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT instructor_user_id AS uid, ${cid("learning_portal_course_id")} AS cid, ANY_VALUE(learning_portal_course_title) AS course,
                   session_title, COUNT(*) AS n,
                   CAST(MIN(DATE(session_start_datetime)) AS STRING) AS first_d, CAST(MAX(DATE(session_start_datetime)) AS STRING) AS last_d
            FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\`
            WHERE session_status = 'COMPLETED' AND session_type IN ('LECTURE', 'PRACTICE')
              AND session_title IS NOT NULL AND learning_portal_course_id IS NOT NULL AND instructor_user_id IS NOT NULL
            GROUP BY 1, 2, 4`,
  }), QUERY_TIMEOUT_MS);
  const courseIds = [...new Set((sessionRows as Record<string, unknown>[]).map((r) => plain(r.cid)).filter(Boolean))];
  if (!courseIds.length) return [];

  // 2) Those courses' topics and unit titles from the training table.
  const [topicRows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT ${cid("course_id")} AS cid, ANY_VALUE(course_title) AS course, topic_id, ANY_VALUE(topic_title) AS topic,
                   ARRAY_AGG(DISTINCT IFNULL(unit_title, '')) AS unit_titles
            FROM \`${ds}.${UNIT_COMPLETION_TABLE}\`
            WHERE ${cid("course_id")} IN UNNEST(@ids) AND topic_title IS NOT NULL
            GROUP BY 1, 3`,
    params: { ids: courseIds },
  }), QUERY_TIMEOUT_MS);

  // Per course: its teachable topics, each with the title keys that count for it.
  type Topic = { title: string; keys: string[] };
  const rawTopics = new Map<string, { title: string; units: string[] }[]>();
  const courseTitle = new Map<string, string>();
  for (const r of topicRows as Record<string, unknown>[]) {
    const c = plain(r.cid);
    const title = plain(r.topic).trim();
    if (!c || !title || NOT_TAUGHT_TOPIC.test(title)) continue;
    if (!courseTitle.has(c)) courseTitle.set(c, plain(r.course));
    const units = ((r.unit_titles as unknown[]) ?? []).map((u) => norm(plain(u))).filter((k) => k.length >= 3);
    if (!rawTopics.has(c)) rawTopics.set(c, []);
    rawTopics.get(c)!.push({ title, units });
  }
  const topicsByCourse = new Map<string, Topic[]>();
  for (const [c, list] of rawTopics) {
    // A unit name shared by two or more topics of the course does not identify a topic.
    const seenIn = new Map<string, number>();
    for (const t of list) for (const k of new Set(t.units)) seenIn.set(k, (seenIn.get(k) ?? 0) + 1);
    const topics: Topic[] = [];
    const seenTitles = new Set<string>();
    for (const t of list) {
      const titleKey = norm(t.title);
      if (!titleKey || seenTitles.has(titleKey)) continue; // same topic title twice in a course = one topic
      seenTitles.add(titleKey);
      const keys = new Set<string>([titleKey]);
      for (const k of t.units) if ((seenIn.get(k) ?? 0) < 2 && !GENERIC_KEY.test(k)) keys.add(k);
      topics.push({ title: t.title, keys: [...keys] });
    }
    if (topics.length) topicsByCourse.set(c, topics);
  }

  // Per (instructor, course): the session title keys, session count and first/last dates.
  type Acc = { course: string; keys: Set<string>; n: number; first: string; last: string };
  const acc = new Map<string, Acc>();
  for (const r of sessionRows as Record<string, unknown>[]) {
    const uid = plain(r.uid), c = plain(r.cid);
    if (!uid || !topicsByCourse.has(c)) continue;
    const id = `${uid}|${c}`;
    let a = acc.get(id);
    if (!a) { a = { course: plain(r.course), keys: new Set(), n: 0, first: "", last: "" }; acc.set(id, a); }
    a.keys.add(norm(plain(r.session_title)));
    a.n += Number(plain(r.n)) || 0;
    const f = plain(r.first_d), l = plain(r.last_d);
    if (f && (!a.first || f < a.first)) a.first = f;
    if (l && l > a.last) a.last = l;
  }

  const out: TaughtCourseRow[] = [];
  for (const [id, a] of acc) {
    const [uid, c] = id.split("|");
    const topics = topicsByCourse.get(c)!;
    const taught = topics.filter((t) => t.keys.some((k) => a.keys.has(k))).map((t) => t.title);
    out.push({
      instructor_user_id: uid,
      course_id: c,
      course_title: a.course || courseTitle.get(c) || c,
      course_subject: courseSubjectOf(c),
      topics_total: topics.length,
      topics_taught: taught.length,
      taught_topics: taught,
      sessions_completed: a.n,
      first_taught_date: a.first || null,
      last_taught_date: a.last || null,
    });
  }
  return out;
}
