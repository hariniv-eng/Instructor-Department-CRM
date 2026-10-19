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
    };
  });
}
