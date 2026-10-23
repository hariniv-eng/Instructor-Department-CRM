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
// Lessons that are not a class of their own: reading material, cheat sheets, notes, getting-started pages.
export const NOT_A_SESSION = /reading material|cheat ?sheet|a note on|getting started|^notes?\b|\bnotes$|summary|quiz|mcq|coding practice|assignment/i;
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

// SESSION-LEVEL mapping (2026-10-22, per request: "Frontend only shows Static Web -- where are Responsive and Modern Responsive? Where
// is MongoDB? Campus-only courses should not be shown"). One campus course often covers SEVERAL learning-portal courses (e.g. Modern
// Responsive Web Design = Static + Responsive + Modern Responsive UI; Introduction to Databases = SQL + MongoDB), so matching the whole
// campus course to one portal course put everything under the first one. Now EACH SESSION goes to the portal course whose topic/unit
// titles contain that session's title:
//   * candidates for a campus course = portal courses sharing at least MATCH_MIN_TITLES of its session titles (avoids stray hits);
//   * a title found in several candidates goes to the earliest one in the Training Stats course order (the foundational course);
//   * sessions matching no portal course, and orientation / intro campus courses, are left out -- so only portal courses are shown.
// Per instructor and portal course: curriculum = distinct session ids mapped to it at their NIAT institutes; completed = theirs.
// The learning portal's own lecture list per course (2026-10-23, per request: "take the TOTAL number of lecture sessions the course has in
// the learning portal, not the sessions scheduled to the instructor"). A lecture = a LEARNING_SET unit of the portal course (same title
// in several versions of the course = one lecture). Each lecture keeps the title keys a session can match: its own unit title, and its
// topic's title (a session titled like the topic covers that topic's first lecture not yet covered).
// units = the course's CLASS SESSIONS (lessons) -- see below. title = the lesson's name as the portal shows it.
export type PortalLectures = { units: { key: string; keys: string[]; topic: string; ord: number; title: string }[]; version: string };
export async function buildSessionTitleMap(bq: BigQuery, ds: string, cid: (c: string) => string): Promise<{ cids: string[]; titles: string[]; keys: string[]; lectures: Map<string, PortalLectures> }> {
  const defs = TRAINING_COURSE_TAXONOMY.filter((d) => d.courseTitles.length || d.courseIds?.length);
  const order = new Map(TRAINING_COURSE_TAXONOMY.map((d, i) => [d.key, i]));
  const ids = [...new Set(defs.flatMap((d) => d.courseIds ?? []).map(cleanId))];
  const ptitles = [...new Set(defs.flatMap((d) => d.courseTitles))];
  const [portalRows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT ${cid("course_id")} AS cid, course_title, version_id, topic_title, unit_title, unit_type, MIN(course_unit_order) AS ord,
                   COUNT(DISTINCT instructor_user_id) AS ins
            FROM \`${ds}.${UNIT_COMPLETION_TABLE}\`
            WHERE ${cid("course_id")} IN UNNEST(@ids) OR course_title IN UNNEST(@titles)
            GROUP BY 1, 2, 3, 4, 5, 6`,
    params: { ids, titles: ptitles },
  }), QUERY_TIMEOUT_MS);
  const lectures = new Map<string, PortalLectures>();
  const lessonRows = new Map<string, Map<string, { ins: number; lessons: Map<string, { title: string; topic: string; ord: number }> }>>();
  const portalKeys = new Map<string, Set<string>>();
  for (const def of defs) portalKeys.set(def.key, new Set());
  for (const r of portalRows as Record<string, unknown>[]) {
    const rc = plain(r.cid), rt = plain(r.course_title), topic = plain(r.topic_title), unit = plain(r.unit_title);
    for (const def of defs) {
      if (!((def.courseIds ?? []).some((i) => cleanId(i) === rc) || def.courseTitles.includes(rt))) continue;
      if (def.topicTitles && !def.topicTitles.includes(topic)) continue;
      for (const k of [...titleKeys(topic), ...titleKeys(unit)]) portalKeys.get(def.key)!.add(k);
      // Candidate CLASS SESSION (lesson) of this course version -- picked per course below.
      if (NOT_TAUGHT_TOPIC.test(topic) || plain(r.unit_type).toUpperCase() !== "LEARNING_SET" || NOT_A_SESSION.test(unit) || !norm(unit)) continue;
      const ver = `${rc}|${plain(r.version_id)}`;
      if (!lessonRows.has(def.key)) lessonRows.set(def.key, new Map());
      const byVer = lessonRows.get(def.key)!;
      if (!byVer.has(ver)) byVer.set(ver, { ins: 0, lessons: new Map() });
      const v = byVer.get(ver)!;
      v.ins = Math.max(v.ins, Number(plain(r.ins)) || 0);
      const k = norm(unit);
      const prev = v.lessons.get(k);
      const ord = Number(plain(r.ord)) || 0;
      if (!prev || ord < prev.ord) v.lessons.set(k, { title: unit, topic: norm(topic), ord });
    }
  }
  // CLASS SESSIONS of each portal course (2026-10-23, per request: "Static Web has ~26 sessions, not 13 topics -- count sessions"). A class
  // session = a lesson (LEARNING_SET unit) such as "Introduction to CSS | Part 2", NOT its Reading Material / Cheat Sheet / notes, and not
  // the quizzes, MCQ / coding practice or daily / module quizzes (those are other unit types). The same course exists in several versions
  // with slightly different lessons, so the version with the MOST instructors on it is used (the one most people see), not a mix.
  // A session covers a lesson when its title equals the lesson's title; the shorter form without "Part N" etc. is also accepted, but only
  // when no other lesson of the course shortens to the same text (so "Part 1" never counts as "Part 2").
  for (const [key, byVer] of lessonRows) {
    const [ver, v] = [...byVer].sort((a, b) => b[1].ins - a[1].ins || b[1].lessons.size - a[1].lessons.size)[0];
    const units = [...v.lessons].map(([k, x]) => ({ key: k, keys: [k], topic: x.topic, ord: x.ord, title: x.title }));
    const shortCount = new Map<string, number>();
    const shortOf = (t: string) => titleKeys(t).find((x) => x !== norm(t));
    for (const u of units) { const sk = shortOf(u.title); if (sk) shortCount.set(sk, (shortCount.get(sk) ?? 0) + 1); }
    for (const u of units) { const sk = shortOf(u.title); if (sk && shortCount.get(sk) === 1 && !units.some((o) => o.key === sk && o !== u)) u.keys.push(sk); }
    units.sort((a, b) => a.ord - b.ord);
    lectures.set(key, { units, version: ver });
  }
  const [taughtRows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT ${cid("learning_portal_course_id")} AS cid, ANY_VALUE(learning_portal_course_title) AS course, ARRAY_AGG(DISTINCT session_title IGNORE NULLS) AS titles
            FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\`
            WHERE institute_type = 'NIAT_OFFLINE' AND session_type IN ('LECTURE', 'PRACTICE') AND learning_portal_course_id IS NOT NULL
            GROUP BY 1`,
  }), QUERY_TIMEOUT_MS);
  const out = { cids: [] as string[], titles: [] as string[], keys: [] as string[], lectures };
  for (const r of taughtRows as Record<string, unknown>[]) {
    if (ORIENTATION_COURSE.test(plain(r.course).trim())) continue;
    const raw = ((r.titles as unknown[]) ?? []).map(plain).filter(Boolean);
    const withKeys = raw.map((t) => ({ t, keys: titleKeys(t) })).filter((x) => x.keys.length);
    const hitsBy = new Map<string, number>();
    for (const [key, set] of portalKeys) hitsBy.set(key, withKeys.filter((x) => x.keys.some((k) => set.has(k))).length);
    const candidates = [...hitsBy].filter(([, n]) => n >= MATCH_MIN_TITLES).map(([k]) => k).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    if (!candidates.length) continue;
    for (const x of withKeys) {
      const key = candidates.find((k) => x.keys.some((kk) => portalKeys.get(k)!.has(kk)));
      if (key) { out.cids.push(plain(r.cid)); out.titles.push(x.t); out.keys.push(key); }
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
  const map = await buildSessionTitleMap(bq, ds, cid);
  if (!map.cids.length) return [];
  const [rows] = await runWithHardTimeout(() => bq.query({
    query: `
      WITH m AS (
        SELECT c AS cid, t AS title, k AS pk FROM UNNEST(@cids) AS c WITH OFFSET i
        JOIN UNNEST(@titles) AS t WITH OFFSET j ON i = j
        JOIN UNNEST(@keys) AS k WITH OFFSET l ON i = l
      ),
      s AS (
        SELECT x.instructor_user_id AS uid, m.pk, x.learning_portal_course_title AS course,
               x.institute_id, x.institute_name,
               -- A curriculum session is counted by its TITLE, not its session id (2026-10-22, per request: "Static has 23 sessions for one
               -- instructor and 52 for another"): every campus, batch and course version has its own session ids for the same session, so
               -- an instructor teaching two batches/versions/campuses had the same sessions counted twice. Same title = one session.
               REGEXP_REPLACE(LOWER(x.session_title), r'[^a-z0-9]+', '') AS sid,
               x.session_title AS title, x.session_status, DATE(x.session_start_datetime) AS d
        FROM \`${ds}.${SESSION_SCHEDULE_TABLE}\` x
        JOIN m ON m.cid = ${cid("x.learning_portal_course_id")} AND m.title = x.session_title
        WHERE x.institute_type = 'NIAT_OFFLINE' AND x.session_type IN ('LECTURE', 'PRACTICE') AND x.session_id IS NOT NULL
      ),
      curriculum AS (SELECT DISTINCT pk, institute_id, sid FROM s),
      mine AS (
        SELECT uid, pk,
               COUNT(DISTINCT IF(session_status = 'COMPLETED', sid, NULL)) AS completed,
               COUNT(DISTINCT sid) AS scheduled,
               CAST(MIN(IF(session_status = 'COMPLETED', d, NULL)) AS STRING) AS first_d,
               CAST(MAX(IF(session_status = 'COMPLETED', d, NULL)) AS STRING) AS last_d,
               ARRAY_AGG(DISTINCT institute_name IGNORE NULLS) AS institutes,
               ARRAY_AGG(DISTINCT course IGNORE NULLS) AS taught_as,
               ARRAY_AGG(DISTINCT IF(session_status = 'COMPLETED', title, NULL) IGNORE NULLS) AS done_titles,
               ARRAY_AGG(DISTINCT title IGNORE NULLS) AS all_titles
        FROM s WHERE uid IS NOT NULL GROUP BY 1, 2
      ),
      -- ONE total per course for everyone (2026-10-22, per request: "it is one course -- why 23 sessions for one instructor and 40 for
      -- another?"). A campus only has the sessions it has SCHEDULED so far, and campuses / cohorts are at different points of the course,
      -- so a per-campus total differed from person to person. The course's total is now its FULL length: the most distinct sessions
      -- any single NIAT campus has scheduled for it (the campus furthest along). Completed is capped at that total.
      per_inst AS (SELECT pk, institute_id, COUNT(DISTINCT sid) AS n FROM curriculum GROUP BY 1, 2),
      standard AS (SELECT pk, MAX(n) AS curriculum FROM per_inst GROUP BY 1)
      SELECT mine.* REPLACE (LEAST(mine.completed, standard.curriculum) AS completed, LEAST(mine.scheduled, standard.curriculum) AS scheduled),
             standard.curriculum
      FROM mine JOIN standard USING (pk)`,
    params: { cids: map.cids, titles: map.titles, keys: map.keys },
  }), QUERY_TIMEOUT_MS);
  // Lectures of the portal course covered by a list of session titles: a session matching a lecture's own title covers it; a session
  // matching only a topic title covers that topic's first lecture not covered yet.
  // Class sessions (lessons) of the portal course covered by a list of session titles (see the lesson keys above).
  const covered = (pk: string, titles: string[]): number | null => {
    const lec = map.lectures.get(pk);
    if (!lec || !lec.units.length) return null;
    const keys = new Set(titles.flatMap((t) => [norm(t), ...titleKeys(t)]));
    return lec.units.filter((u) => u.keys.some((k) => keys.has(k))).length;
  };
  return (rows as Record<string, unknown>[]).map((r) => {
    const pk = plain(r.pk);
    const def = TRAINING_COURSE_TAXONOMY.find((d) => d.key === pk);
    // Total = the course's CLASS SESSIONS in the learning portal (the same for every instructor); completed = those sessions they have
    // taught (completed); scheduled = those scheduled for them. Fallback to the schedule-based figures only if the portal has no lessons.
    const total = map.lectures.get(pk)?.units.length ?? 0;
    const doneTitles = ((r.done_titles as unknown[]) ?? []).map(plain);
    const allTitles = ((r.all_titles as unknown[]) ?? []).map(plain);
    const lecDone = total ? covered(pk, doneTitles) : null;
    const lecSched = total ? covered(pk, allTitles) : null;
    const completedN = lecDone ?? (Number(plain(r.completed)) || 0);
    const scheduledN = lecSched ?? (Number(plain(r.scheduled)) || 0);
    const curriculumN = total || (Number(plain(r.curriculum)) || 0);
    return {
      instructor_user_id: plain(r.uid),
      course_id: `portal:${pk}`,
      course_title: def?.label ?? pk,
      course_subject: def ? (def.key === "math_for_cs" ? "Maths" : TRACK_SUBJECT[def.trackGroup] ?? null) : null,
      topics_total: 0,
      topics_taught: 0,
      // Campus course names these sessions were taught under (shown on hover).
      taught_topics: ((r.taught_as as unknown[]) ?? []).map(plain).filter(Boolean),
      sessions_completed: Number(plain(r.completed)) || 0, // distinct completed session titles (before the lecture mapping)
      first_taught_date: plain(r.first_d) || null,
      last_taught_date: plain(r.last_d) || null,
      curriculum_sessions: curriculumN,
      completed_sessions: Math.min(completedN, curriculumN),
      scheduled_sessions: Math.min(scheduledN, curriculumN),
      institutes: ((r.institutes as unknown[]) ?? []).map(plain).filter(Boolean),
      portal_course_key: pk,
      portal_match_pct: 100,
    };
  });
}
