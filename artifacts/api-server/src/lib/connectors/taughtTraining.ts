// REWORKED 2026-10-19 (per request: "the topic matching is not working out"): completion is now counted by SESSION ID. Every curriculum
// session of a course has its own session_id (shared by every section that takes it). For each NIAT instructor and course they teach:
//   curriculum = distinct Lecture/Practice session ids scheduled for that course at the NIAT institutes they teach it at (any instructor);
//   completed  = distinct session ids of that course THEY completed;  % = completed / curriculum.
// Only NIAT_OFFLINE institutes are read. The topic-matching notes below are kept for history; fetchTaughtCourseRows() no longer uses them.
//
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
import { SESSION_SCHEDULE_TABLE, TRACK_SUBJECT } from "./instructorContribution";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { TEACHING_COURSE_SUBJECTS, TAUGHT_COURSE_TITLE_SUBJECTS } from "../../data/teachingCourseSubjects";
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
  curriculum_sessions: number;
  completed_sessions: number;
  scheduled_sessions: number;
  institutes: string[];
  // The learning-portal course (Training Stats course list key) this course's content matches -- see matchToPortalCourses().
  portal_course_key: string | null;
  portal_match_pct: number;
};

// Topics that are not taught in class, left out of a course's topic count.
export const NOT_TAUGHT_TOPIC = /assignment|mock|quiz|exam|interview|question bank|assessment|project|^learn$|cheat ?sheet|revision/i;
const QUERY_TIMEOUT_MS = 180000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const cleanId = (s: string) => s.replace(/-/g, "").toLowerCase();

// The subject COLUMNS of the "Taught in class" view (2026-10-19, per request: one row per instructor, a column per subject).
export const TAUGHT_SUBJECT_COLUMNS = ["Frontend", "Backend", "DSA", "GenAI", "Artificial Intelligence & Emerging Technologies", "Aptitude", "Maths", "English", "Other"] as const;
// Column of a course: its subject by id, else by title (TAUGHT_COURSE_TITLE_SUBJECTS); Math for Computer Science counts as Maths;
// anything else (other subjects, unmapped) is "Other"; general/orientation courses get null = left out of the view.
// Orientation / introduction courses (2026-10-19, per request: "intro to OS, intro to software... all these orientation sessions should
// not be included as a course"): Intro to Tech (Intro to OS & Internet, Intro to Frontend/Backend...), Intro to Software Development
// (Intro to ML / AI), Aptitude Orientation, Orientation, welcome webinars. Left out of the view entirely. Real courses whose title just
// starts with "Introduction to" (React JS, Databases, Programming, TypeScript, Logic, Quantum Physics...) are NOT matched.
export const ORIENTATION_COURSE = /^(intro|introduction) to (tech|software( development)?|operating systems?|os|computers?)\b|orientation|welcome webinar|webinar/i;
// Courses shown as ONE column (2026-10-19, per request: "Intro to Generative AI" and "Generative AI" are two course ids with mostly the
// same content). Key = title in lower case, letters/digits only; value = the merged column's key and title. An instructor's sessions
// in both are added together (completed and total).
const MERGED_COURSES: Record<string, { key: string; title: string }> = {
  introtogenerativeai: { key: "merged:generativeai", title: "Generative AI (incl. Intro to Generative AI)" },
  generativeai: { key: "merged:generativeai", title: "Generative AI (incl. Intro to Generative AI)" },
};
export const mergedCourseOf = (courseId: string, title: string): { key: string; title: string } | null => MERGED_COURSES[norm(title)] ?? null;
// The column a course goes into (2026-10-19, per request: "why two Quantitative Aptitude / two Logical Reasoning columns?"): the same
// course exists under several course ids (one per university / cohort / version), so courses are grouped by TITLE (lower case,
// letters/digits only), plus the MERGED_COURSES pairs above. An instructor's sessions across those ids are added together.
// Learning-portal course of a key from the Training Stats course list: its column (key + label) and subject.
export function portalColumnOf(portalKey: string | null): { key: string; title: string; subject: string } | null {
  const def = portalKey ? TRAINING_COURSE_TAXONOMY.find((d) => d.key === portalKey) : undefined;
  if (!def) return null;
  return { key: `portal:${def.key}`, title: def.label, subject: TRACK_SUBJECT[def.trackGroup] ?? "Other" };
}
export const courseColumnOf = (courseId: string, title: string): { key: string; title: string } => {
  const merged = mergedCourseOf(courseId, title);
  if (merged) return merged;
  const t = displayCourseTitle(title);
  return { key: `title:${norm(t) || courseId}`, title: t };
};
// Programming Foundations is the Python course (2026-10-19, per request): shown as "Programming Foundations (Python)", under Backend.
export const displayCourseTitle = (title: string): string => (/^programming foundations$/i.test(title.trim()) ? "Programming Foundations (Python)" : title);
export function taughtSubjectColumn(courseId: string, courseTitle: string): string | null {
  if (ORIENTATION_COURSE.test(courseTitle.trim())) return null;
  const bySubject = courseSubjectOf(courseId) ?? TAUGHT_COURSE_TITLE_SUBJECTS[norm(courseTitle)] ?? null;
  if (bySubject === "General") return null;
  if (bySubject === "Math for Computer Science") return "Maths";
  return bySubject && (TAUGHT_SUBJECT_COLUMNS as readonly string[]).includes(bySubject) ? bySubject : "Other";
}

// Subject of a course: teaching-course list first (null there = a general course), then the Training Stats course list.
function courseSubjectOf(courseId: string): string | null {
  if (courseId in TEACHING_COURSE_SUBJECTS) return TEACHING_COURSE_SUBJECTS[courseId] ?? "General";
  for (const def of TRAINING_COURSE_TAXONOMY) {
    if ((def.courseIds ?? []).some((id) => cleanId(id) === courseId)) return def.key === "math_for_cs" ? "Math for Computer Science" : (TRACK_SUBJECT[def.trackGroup] ?? null);
  }
  return null;
}

// CONTENT MATCH to the learning-portal courses (2026-10-19, per request: "four Math for CS columns... check what the course is and if it
// is the same, make it one; do it for every subject; e.g. English has four courses in the learning portal -- tag every course's
// sessions across campuses to one of them"). The same course is taught under many course ids and names (one per university /
// version), so each taught course is matched by CONTENT to one course of the Training Stats course list (trainingCourseTaxonomy.ts):
//   * its distinct Lecture/Practice session titles at NIAT institutes (generic ones such as "MCQ Practice" / "Coding Practice" dropped),
//   * against each portal course's topic and unit titles,
//   * share = session titles found in that portal course / the taught course's session titles. Best share wins, if it is at least
//     MATCH_MIN_SHARE and MATCH_MIN_TITLES titles; otherwise the course keeps its own column (grouped by name).
const MATCH_MIN_SHARE = 0.2;
const MATCH_MIN_TITLES = 3;
const GENERIC_TITLE = /^(mcq|mcqs|mcqpractice|codingpractice|practice|practiceset|practicesession|readingmaterial|quiz|video|ppt|assignment|cheatsheet|summary|learn|introduction|courseoverview|lab|selflearning|theoreticalconcepts|revision|doubtclearing|doubtsession|practical|aboutthecourse|coursequiz|courseexam)\d*$/;
// Title keys: the plain normalised title, plus the same title with trailing "practice / mcq / part N / coding practice" words removed,
// so "Loops MCQ Practice" and "Loops Coding Practice" still find the unit "Loops".
function titleKeys(title: string): string[] {
  const k = norm(title);
  if (!k || GENERIC_TITLE.test(k)) return [];
  const stripped = norm(title.replace(/\b(mcq|mcqs|coding|practice|practise|session|part|reading material|implementation|daily|ppt|video|lab)\b/gi, " ").replace(/\b(\d+|i{1,3}|iv|v)\b/gi, " "));
  return stripped && stripped !== k && stripped.length >= 4 && !GENERIC_TITLE.test(stripped) ? [k, stripped] : [k];
}
export async function matchToPortalCourses(bq: BigQuery, ds: string, cid: (c: string) => string): Promise<Map<string, { key: string; pct: number }>> {
  const defs = TRAINING_COURSE_TAXONOMY.filter((d) => d.courseTitles.length || d.courseIds?.length);
  const ids = [...new Set(defs.flatMap((d) => d.courseIds ?? []).map(cleanId))];
  const titles = [...new Set(defs.flatMap((d) => d.courseTitles))];
  const [portalRows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT DISTINCT ${cid("course_id")} AS cid, course_title, topic_title, unit_title FROM \`${ds}.${UNIT_COMPLETION_TABLE}\`
            WHERE ${cid("course_id")} IN UNNEST(@ids) OR course_title IN UNNEST(@titles)`,
    params: { ids, titles },
  }), QUERY_TIMEOUT_MS);
  const portalKeys = new Map<string, Set<string>>();
  for (const def of defs) portalKeys.set(def.key, new Set());
  for (const r of portalRows as Record<string, unknown>[]) {
    const rc = plain(r.cid), rt = plain(r.course_title), topic = plain(r.topic_title), unit = plain(r.unit_title);
    for (const def of defs) {
      if (!((def.courseIds ?? []).some((i) => cleanId(i) === rc) || def.courseTitles.includes(rt))) continue;
      if (def.topicTitles && !def.topicTitles.includes(topic)) continue;
      const set = portalKeys.get(def.key)!;
      for (const k of [...titleKeys(topic), ...titleKeys(unit)]) set.add(k);
    }
  }
  const [taughtRows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT ${cid("learning_portal_course_id")} AS cid, ARRAY_AGG(DISTINCT session_title IGNORE NULLS) AS titles
            FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\`
            WHERE institute_type = 'NIAT_OFFLINE' AND session_type IN ('LECTURE', 'PRACTICE') AND learning_portal_course_id IS NOT NULL
            GROUP BY 1`,
  }), QUERY_TIMEOUT_MS);
  const out = new Map<string, { key: string; pct: number }>();
  for (const r of taughtRows as Record<string, unknown>[]) {
    const titleSets = ((r.titles as unknown[]) ?? []).map((t) => titleKeys(plain(t))).filter((k) => k.length);
    if (!titleSets.length) continue;
    let best: { key: string; hits: number } | null = null;
    for (const [key, set] of portalKeys) {
      const hits = titleSets.filter((keys) => keys.some((k) => set.has(k))).length;
      if (!best || hits > best.hits) best = { key, hits };
    }
    if (best && best.hits >= MATCH_MIN_TITLES && best.hits / titleSets.length >= MATCH_MIN_SHARE) {
      out.set(plain(r.cid), { key: best.key, pct: Math.round((best.hits / titleSets.length) * 100) });
    }
  }
  return out;
}

export async function fetchTaughtCourseRows(): Promise<TaughtCourseRow[]> {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const cid = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;
  const [rows] = await runWithHardTimeout(() => bq.query({
    query: `
      WITH s AS (
        SELECT instructor_user_id AS uid, ${cid("learning_portal_course_id")} AS cid, learning_portal_course_title AS course,
               institute_id, institute_name, CAST(session_id AS STRING) AS sid, session_status, DATE(session_start_datetime) AS d
        FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\`
        WHERE institute_type = 'NIAT_OFFLINE' AND session_type IN ('LECTURE', 'PRACTICE')
          AND session_id IS NOT NULL AND learning_portal_course_id IS NOT NULL
      ),
      curriculum AS (SELECT DISTINCT cid, institute_id, sid FROM s),
      mine AS (
        SELECT uid, cid, ANY_VALUE(course) AS course,
               COUNT(DISTINCT IF(session_status = 'COMPLETED', sid, NULL)) AS completed,
               COUNT(DISTINCT sid) AS scheduled,
               CAST(MIN(IF(session_status = 'COMPLETED', d, NULL)) AS STRING) AS first_d,
               CAST(MAX(IF(session_status = 'COMPLETED', d, NULL)) AS STRING) AS last_d,
               ARRAY_AGG(DISTINCT institute_name IGNORE NULLS) AS institutes
        FROM s WHERE uid IS NOT NULL GROUP BY 1, 2
      ),
      mine_inst AS (SELECT DISTINCT uid, cid, institute_id FROM s WHERE uid IS NOT NULL),
      totals AS (
        SELECT m.uid, m.cid, COUNT(DISTINCT c.sid) AS curriculum
        FROM mine_inst m JOIN curriculum c ON c.cid = m.cid AND c.institute_id = m.institute_id
        GROUP BY 1, 2
      )
      SELECT mine.*, totals.curriculum FROM mine JOIN totals USING (uid, cid)`,
  }), QUERY_TIMEOUT_MS);
  const portalMatch = await matchToPortalCourses(bq, ds, cid).catch((e) => { console.error("[taught-training] portal-course match failed:", e); return new Map<string, { key: string; pct: number }>(); });
  return (rows as Record<string, unknown>[]).map((r) => {
    const c = plain(r.cid);
    return {
      instructor_user_id: plain(r.uid),
      course_id: c,
      course_title: plain(r.course) || c,
      course_subject: courseSubjectOf(c),
      topics_total: 0,
      topics_taught: 0,
      taught_topics: [],
      sessions_completed: Number(plain(r.completed)) || 0,
      first_taught_date: plain(r.first_d) || null,
      last_taught_date: plain(r.last_d) || null,
      curriculum_sessions: Number(plain(r.curriculum)) || 0,
      completed_sessions: Number(plain(r.completed)) || 0,
      scheduled_sessions: Number(plain(r.scheduled)) || 0,
      institutes: ((r.institutes as unknown[]) ?? []).map(plain).filter(Boolean),
      portal_course_key: portalMatch.get(c)?.key ?? null,
      portal_match_pct: portalMatch.get(c)?.pct ?? 0,
    };
  });
}
