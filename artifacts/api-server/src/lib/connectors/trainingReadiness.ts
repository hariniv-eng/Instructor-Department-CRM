// Training - Readiness (2026-11-16, per request: "Training Instructors - Pre-Deployment Readiness", Phase 1). For NIAT (Training)
// instructors, three scores and one completion check, all from data FCC already reads:
//   Demo score    -- in-training demos (DEMO / TRAINING_DEMO, 10 minutes or longer; no duration = counted) from niat_session_wise_qa_rating.
//                    Best score per lecture (retakes: best attempt), then the average over the lectures they have a demo on.
//   AI score      -- the same for in-training AI assessments (AI_ASSESSMENT / TRAINING_AI_ASSESSMENT), no duration rule.
//   Top-N score   -- topin trainee exams (connectors/topinAssessments.ts), Daily + Weekly exams of the instructor's own subject:
//                    average of their best % per exam.
//   Complete      -- a demo AND an AI assessment on every lecture of every lecture-list course of their subject (data/lectureSessions.ts).
// Lectures are matched by topic name exactly as Training - Demos does (lectureNameIndex / matchDemoTopic), only to courses of the
// instructor's own subject. "In training" = demoKindOf (before the deployment date; not deployed yet = everything).
// Colours (thresholds from the plan): Green demo >= 7.5, AI >= 8.5, Top-N >= 75%; Yellow demo >= 6.5, AI >= 7.5, Top-N >= 60%; else Red.
// Overall = the lowest of the three (a score with no data yet counts as Red). Not complete = "Incomplete" shown next to the colour so far
// (per request: "lowest of the three + Incomplete"); fully Ready = Green AND complete. Show only -- nothing is stored.
import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout } from "./timeout";
import { LECTURE_COURSES } from "../../data/lectureSessions";
import { QA_RATING_VIEW, demoKindOf, lectureNameIndex, matchDemoTopic, type DemoWindow } from "./demoTraining";
import { ASSESSMENT_COURSES, normUid, type ExamCell } from "./topinAssessments";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { notPreparednessCondition } from "./preparedness";
import { taughtSubjectColumn } from "./taughtTraining";

export const READINESS_THRESHOLDS = { demo: { green: 7.5, yellow: 6.5 }, ai: { green: 8.5, yellow: 7.5 }, topn: { green: 75, yellow: 60 } } as const;
export type Colour = "green" | "yellow" | "red" | "none";
const RANK: Record<Colour, number> = { green: 2, yellow: 1, red: 0, none: 0 };
const colourOf = (v: number | null, t: { green: number; yellow: number }): Colour => (v === null ? "none" : v >= t.green ? "green" : v >= t.yellow ? "yellow" : "red");
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 100) / 100 : null);
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

type Ev = { title: string; score: number | null; date: string | null; type: string; mins: number | null };
type EvData = { byUid: Map<string, Ev[]>; fetchedAt: string };
let cache: { at: number; data: EvData } | null = null;

/** Every completed demo / AI assessment, per TeachOS user id (normUid). Cached 10 minutes. */
export async function fetchReadinessEvaluations(force = false): Promise<EvData> {
  if (!force && cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.data;
  const keys = missing(["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET"] as const);
  if (keys.length) throw new Error(`BigQuery settings missing: ${keys.join(", ")}`);
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT instructor_user_id AS uid, session_title AS t, final_score AS s, CAST(session_date AS STRING) AS d,
                   evaluation_type AS ty, SAFE_CAST(audio_duration AS FLOAT64) / 60 AS mins
            FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\`
            WHERE evaluation_type IN ('DEMO', 'TRAINING_DEMO', 'MOCK', 'AI_ASSESSMENT', 'TRAINING_AI_ASSESSMENT') AND LOWER(status) = 'completed' -- MOCK = a normal demo (2026-11-17)
              AND instructor_user_id IS NOT NULL AND session_title IS NOT NULL
              AND ${notPreparednessCondition(`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}`)}`,
  }), 120000);
  const byUid = new Map<string, Ev[]>();
  for (const r of rows as Record<string, unknown>[]) {
    const uid = normUid(plain(r.uid));
    const s = plain(r.s), m = plain(r.mins);
    const ev: Ev = { title: plain(r.t), score: s === "" || !Number.isFinite(Number(s)) ? null : Number(s), date: plain(r.d).slice(0, 10) || null, type: plain(r.ty),
      mins: m === "" || !Number.isFinite(Number(m)) ? null : Number(m) };
    byUid.set(uid, [...(byUid.get(uid) ?? []), ev]);
  }
  const data = { byUid, fetchedAt: new Date().toISOString() };
  cache = { at: Date.now(), data };
  return data;
}

// Semester of each course (2026-11-16, per request: "a semester-wise breakdown in the readiness dashboard"). Same semesters as Training -
// LP (COURSE_SEMESTER in training-stats.tsx); lecture-list courses with their own keys placed by subject order: Introduction to English
// Language -> Sem 1, DBMS -> Sem 2 (with SQL / MongoDB), DSA (C++) -> 2, DSA II -> 3, IPS -> 4. Topin exams on a whole subject (General
// columns, DSA, Gen AI) have no semester and count only in "All semesters".
export const LECTURE_SEMESTER: Record<string, number> = {
  static_web: 1, modern_responsive_ui: 1, javascript_essentials: 2, dynamic_web_app: 2, react_js: 3,
  python: 1, sql: 2, lecture_dbms: 2, mongodb: 2, node_js: 3,
  lecture_dsa_c: 2, lecture_dsa_ii_hashing_linked_lists_stacks_trees_heaps: 3, lecture_ips: 4,
  gen_ai: 1, llm: 2, ai_for_finance: 3,
  quantitative_aptitude: 1, numerical_ability: 2, logical_reasoning: 3,
  math_for_cs: 1, probability_statistics: 3,
  lecture_introduction_to_english_language_and_communication: 1, english_foundation: 1, english_advanced: 2, english_applied: 3,
  // Semester 4 / 6 lecture lists (2026-11-27, from the CDU Semester 4 and KKH Semester 6 prod sequence).
  advanced_aptitude: 4, language_analytics: 4, linear_algebra_calculus: 4, computer_networks: 4, operating_systems: 4, production_ai: 4, environmental_science: 4,
  ml: 6, deep_learning: 6, lecture_data_visualization: 6, practical_software_engineering: 6, iot: 6, lecture_robotics_operating_system: 6,
};
export const EXAM_SEMESTER: Record<string, number> = {
  lp_quantitative_aptitude: 1, lp_numerical_ability: 2, lp_logical_reasoning: 3, // Aptitude: learning-portal assessments (2026-11-19)
  static_web: 1, responsive_design: 1, modern_responsive_ui: 1, javascript_sprint: 2, javascript_essentials: 2, dynamic_web_app: 2, react_js: 3,
  python: 1, sql: 2, mongodb: 2, node_js: 3, math_for_cs: 1, probability_statistics: 3, linear_algebra_calculus: 4,
};

// Aptitude Top-N from the LEARNING PORTAL (2026-11-19, per request: "topin Aptitude exams cannot be split into courses -- for Aptitude
// only, use the learning-portal assessments of each course instead: count them and average the scores"). Choices made with the user:
// unit types EXAM + QUIZ (graded exams and classroom quizzes; daily PRACTICE left out), courses Quantitative Aptitude (Sem 1),
// Numerical Ability (Sem 2), Logical Reasoning (Sem 3), plus Advanced / Advance Aptitude (no semester: counts only in All semesters).
// Score = best % per unit (best_exam_percentage_score, units with a score), averaged over the units they took. Revision, bridge, mock,
// orientation and "Numerical Ability and Reasoning Skills for Engineers" courses are not counted. Every other subject stays on topin.
// The topin "Aptitude exams" bucket is no longer used here (it still shows on Training - Assessments).
export const APTITUDE_LP_COURSES: { key: string; title: string; subject: string; titles: string[] }[] = [
  { key: "lp_quantitative_aptitude", title: "Quantitative Aptitude (learning portal)", subject: "Aptitude", titles: ["quantitative aptitude"] },
  { key: "lp_numerical_ability", title: "Numerical Ability (learning portal)", subject: "Aptitude", titles: ["numerical ability"] },
  { key: "lp_logical_reasoning", title: "Logical Reasoning (learning portal)", subject: "Aptitude", titles: ["logical reasoning"] },
  { key: "lp_advanced_aptitude", title: "Advanced Aptitude (learning portal)", subject: "Aptitude", titles: ["advanced aptitude", "advance aptitude"] },
];
export const APTITUDE_LP_UNIT_TYPES = ["EXAM", "QUIZ"];
const TOPN_COURSES: { key: string; subject: string }[] = [...ASSESSMENT_COURSES.filter((c) => c.subject !== "Aptitude"), ...APTITUDE_LP_COURSES];
let lpAptCache: { at: number; data: Map<string, Record<string, ExamCell>> } | null = null;

/** Aptitude learning-portal assessment scores per TeachOS user id (normUid) -> course key -> cell (in `daily`). Cached 10 minutes. */
export async function fetchLpAptitudeScores(force = false): Promise<Map<string, Record<string, ExamCell>>> {
  if (!force && lpAptCache && Date.now() - lpAptCache.at < 10 * 60 * 1000) return lpAptCache.data;
  const keyOfTitle = new Map(APTITUDE_LP_COURSES.flatMap((c) => c.titles.map((t) => [t, c.key] as const)));
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT instructor_user_id AS u, LOWER(TRIM(course_title)) AS t, COUNT(DISTINCT unit_id) AS n, AVG(best_exam_percentage_score) AS s,
              MAX(CAST(COALESCE(completion_datetime, last_progress_date) AS STRING)) AS d
            FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${UNIT_COMPLETION_TABLE}\`
            WHERE instructor_user_id IS NOT NULL AND best_exam_percentage_score IS NOT NULL AND unit_type IN UNNEST(@types)
              AND LOWER(TRIM(course_title)) IN UNNEST(@titles) GROUP BY 1, 2`,
    params: { types: APTITUDE_LP_UNIT_TYPES, titles: [...keyOfTitle.keys()] },
  }), 120000);
  const acc = new Map<string, Map<string, { n: number; sum: number; last: string | null }>>();
  for (const r of rows as Record<string, unknown>[]) {
    const key = keyOfTitle.get(plain(r.t));
    if (!key) continue;
    const uid = normUid(plain(r.u));
    const m = acc.get(uid) ?? new Map();
    const x = m.get(key) ?? { n: 0, sum: 0, last: null };
    const n = Number(plain(r.n)) || 0, d = plain(r.d).slice(0, 10) || null;
    x.n += n; x.sum += (Number(plain(r.s)) || 0) * n; if (d && (!x.last || d > x.last)) x.last = d;
    m.set(key, x); acc.set(uid, m);
  }
  const data = new Map<string, Record<string, ExamCell>>();
  for (const [uid, m] of acc) data.set(uid, Object.fromEntries([...m].map(([k, x]) => [k, { daily: { exams: x.n, avg: x.n ? Math.round((x.sum / x.n) * 10) / 10 : null, last_date: x.last }, weekly: null }])));
  lpAptCache = { at: Date.now(), data };
  return data;
}

// Overall assessments for Aptitude and Maths (2026-11-19, per request: "for Aptitude and Maths, in the All semesters view, for every
// instructor: how many topin assessments and how many learning-portal assessments they have given, with the average -- we cannot tell
// which topin exam belongs to which semester, so overall only"). Shown next to the scores; NOT used for the colours.
//   topin = every topin Daily + Weekly exam of the subject (all of its course buckets, incl. the general one), average best %.
//   learning portal = every EXAM + QUIZ unit with a score in any learning-portal course of the subject (subject of a course as in
//   Taught in Class), average best %.
export const OVERALL_ASSESSMENT_SUBJECTS = ["Aptitude", "Maths"];
export type OverallAssessments = { topin_exams: number; topin_avg: number | null; lp_units: number; lp_avg: number | null };
export function topinOverallOf(cells: Record<string, ExamCell> | undefined, subject: string): { n: number; avg: number | null } {
  let n = 0, sum = 0;
  for (const c of ASSESSMENT_COURSES) {
    if (c.subject !== subject) continue;
    for (const x of [cells?.[c.key]?.daily, cells?.[c.key]?.weekly]) if (x && x.avg !== null) { n += x.exams; sum += x.avg * x.exams; }
  }
  return { n, avg: n ? Math.round((sum / n) * 10) / 10 : null };
}
let lpSubjCache: { at: number; data: Map<string, Record<string, { n: number; avg: number | null }>> } | null = null;
/** Learning-portal EXAM + QUIZ units with a score, per TeachOS user id (normUid) and subject (Aptitude / Maths). Cached 10 minutes. */
export async function fetchLpSubjectAssessments(force = false): Promise<Map<string, Record<string, { n: number; avg: number | null }>>> {
  if (!force && lpSubjCache && Date.now() - lpSubjCache.at < 10 * 60 * 1000) return lpSubjCache.data;
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT instructor_user_id AS u, REPLACE(LOWER(CAST(course_id AS STRING)), '-', '') AS cid, course_title AS t, COUNT(DISTINCT unit_id) AS n, AVG(best_exam_percentage_score) AS s
            FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${UNIT_COMPLETION_TABLE}\`
            WHERE instructor_user_id IS NOT NULL AND best_exam_percentage_score IS NOT NULL AND unit_type IN UNNEST(@types) GROUP BY 1, 2, 3`,
    params: { types: APTITUDE_LP_UNIT_TYPES },
  }), 120000);
  const acc = new Map<string, Map<string, { n: number; sum: number }>>();
  for (const r of rows as Record<string, unknown>[]) {
    const subject = taughtSubjectColumn(plain(r.cid), plain(r.t));
    if (!subject || !OVERALL_ASSESSMENT_SUBJECTS.includes(subject)) continue;
    const uid = normUid(plain(r.u));
    const m = acc.get(uid) ?? new Map<string, { n: number; sum: number }>();
    const x = m.get(subject) ?? { n: 0, sum: 0 };
    const n = Number(plain(r.n)) || 0;
    x.n += n; x.sum += (Number(plain(r.s)) || 0) * n;
    m.set(subject, x); acc.set(uid, m);
  }
  const data = new Map([...acc].map(([u, m]) => [u, Object.fromEntries([...m].map(([s, x]) => [s, { n: x.n, avg: x.n ? Math.round((x.sum / x.n) * 10) / 10 : null }]))]));
  lpSubjCache = { at: Date.now(), data };
  return data;
}

export type ReadinessCourse = { key: string; title: string; semester: number | null; lectures_total: number; demo_lectures: number; ai_lectures: number; both_lectures: number; demo_avg: number | null; ai_avg: number | null };
export type ReadinessBlock = {
  has_lecture_list: boolean;
  lectures_total: number; demo_lectures: number; ai_lectures: number; both_lectures: number; complete: boolean;
  demo_avg: number | null; ai_avg: number | null; topn_avg: number | null; topn_exams: number;
  demo_colour: Colour; ai_colour: Colour; topn_colour: Colour; overall: "green" | "yellow" | "red";
};
/** Top level = all semesters; semesters = the same block for each semester the subject has courses in. */
export type Readiness = ReadinessBlock & { courses: ReadinessCourse[]; semesters: Record<string, ReadinessBlock> };
type Best = { demo: number | null; ai: number | null; demoDone: boolean; aiDone: boolean };

export function readinessOf(subjects: string[], evs: Ev[], w: DemoWindow | undefined, exams: Record<string, ExamCell> | undefined,
  idx: ReturnType<typeof lectureNameIndex> = lectureNameIndex()): Readiness {
  const own = LECTURE_COURSES.map((c, ci) => ({ c, ci })).filter((x) => subjects.includes(x.c.subject));
  const ownCi = new Set(own.map((x) => x.ci));
  const best = new Map<string, Best>(); // `${ci}|${n}`
  for (const e of evs) {
    if (!demoKindOf(e.type, e.date, w).endsWith("_training")) continue;
    const ai = e.type.endsWith("AI_ASSESSMENT");
    if (!ai && e.mins !== null && e.mins < 10) continue; // demos under 10 minutes do not count
    const hits = (matchDemoTopic(idx, e.title) ?? []).filter((h) => ownCi.has(h.ci) && h.n > 0);
    for (const k of new Set(hits.map((h) => `${h.ci}|${h.n}`))) {
      const b = best.get(k) ?? { demo: null, ai: null, demoDone: false, aiDone: false };
      if (ai) { b.aiDone = true; if (e.score !== null && (b.ai === null || e.score > b.ai)) b.ai = e.score; }
      else { b.demoDone = true; if (e.score !== null && (b.demo === null || e.score > b.demo)) b.demo = e.score; }
      best.set(k, b);
    }
  }
  const lecturesOf = (ci: number) => LECTURE_COURSES[ci].lectures.map((l) => best.get(`${ci}|${l.n}`)).filter((b): b is Best => !!b);
  const scores = (lec: Best[], k: "demo" | "ai") => lec.flatMap((b) => (b[k] === null ? [] : [b[k] as number]));
  const courses: ReadinessCourse[] = own.map(({ c, ci }) => {
    const lec = lecturesOf(ci);
    return { key: c.key, title: c.title, semester: LECTURE_SEMESTER[c.key] ?? null, lectures_total: c.lectures.length,
      demo_lectures: lec.filter((b) => b.demoDone).length, ai_lectures: lec.filter((b) => b.aiDone).length, both_lectures: lec.filter((b) => b.demoDone && b.aiDone).length,
      demo_avg: avg(scores(lec, "demo")), ai_avg: avg(scores(lec, "ai")) };
  });
  // One block for a set of courses (sem = null: all courses and every exam of the subject).
  const block = (sem: number | null): ReadinessBlock => {
    const cs = own.filter(({ c }) => sem === null || LECTURE_SEMESTER[c.key] === sem);
    const lec = cs.flatMap(({ ci }) => lecturesOf(ci));
    const demo_avg = avg(scores(lec, "demo")), ai_avg = avg(scores(lec, "ai"));
    let n = 0, sum = 0; // Top-N: Daily + Weekly exams -- average best % over all those exams
    for (const c of TOPN_COURSES) {
      if (!subjects.includes(c.subject) || (sem !== null && EXAM_SEMESTER[c.key] !== sem)) continue;
      for (const x of [exams?.[c.key]?.daily, exams?.[c.key]?.weekly]) if (x && x.avg !== null) { n += x.exams; sum += x.avg * x.exams; }
    }
    const topn_avg = n ? Math.round((sum / n) * 10) / 10 : null;
    const lectures_total = cs.reduce((a, { c }) => a + c.lectures.length, 0);
    const both = lec.filter((b) => b.demoDone && b.aiDone).length;
    const demo_colour = colourOf(demo_avg, READINESS_THRESHOLDS.demo), ai_colour = colourOf(ai_avg, READINESS_THRESHOLDS.ai), topn_colour = colourOf(topn_avg, READINESS_THRESHOLDS.topn);
    const rank = Math.min(RANK[demo_colour], RANK[ai_colour], RANK[topn_colour]);
    return { has_lecture_list: cs.length > 0, lectures_total, complete: lectures_total > 0 && both === lectures_total, both_lectures: both,
      demo_lectures: lec.filter((b) => b.demoDone).length, ai_lectures: lec.filter((b) => b.aiDone).length,
      demo_avg, ai_avg, topn_avg, topn_exams: n, demo_colour, ai_colour, topn_colour, overall: rank === 2 ? "green" : rank === 1 ? "yellow" : "red" };
  };
  const sems = [...new Set(own.map(({ c }) => LECTURE_SEMESTER[c.key]).filter((x): x is number => x !== undefined))].sort((a, b) => a - b);
  return { ...block(null), courses, semesters: Object.fromEntries(sems.map((x) => [String(x), block(x)])) };
}

// "Learning now" (2026-11-16, per request: "instructors may be mapped to one subject but be learning another right now -- take it from
// their learning-portal courses and their latest demos; if they are studying two subjects together, show both"). Checked on the 97
// NIAT (Training) instructors with _tmp_learning_subject.ts: 21 were active only in another subject, 25 in several. The learning portal
// is noisy (a few stray units in many subjects), so demos come first:
// Rule (2026-11-16, per request: "taking demos or AI assessments is a big deal, reading is not" -- same rule for instructors and mentors):
//   1. Demos / AI assessments in the last LEARNING_DAYS days (in-training, any subject; a topic name found in several subjects is skipped):
//      the top subject, plus every other subject with at least MIN_DEMOS of them -> all these subjects are scored.
//   2. No demos: the top subject by learning-portal units COMPLETED in the last LEARNING_DAYS days (completion_datetime, course ->
//      subject as in Taught in Class).
//   3. Neither: the mapped subject.
// "Reading": other subjects with at least LEARNING_SHARE of the top subject's learning-portal units but no (or too few) demos -- shown,
// not scored.
export const LEARNING_DAYS = 30;
export const LEARNING_SHARE = 0.25;
export const MIN_DEMOS = 2;
export type SubjectActivity = { subject: string; count: number; last: string | null };
export type LearningNow = { subjects: string[]; reading: string[]; source: "demos" | "learning portal" | "mapped subject"; demos: SubjectActivity[]; lp: SubjectActivity[] };
const sinceDay = () => new Date(Date.now() - LEARNING_DAYS * 86400000).toISOString().slice(0, 10);
let lpCache: { at: number; data: Map<string, SubjectActivity[]> } | null = null;

/** Learning-portal units completed in the last LEARNING_DAYS days, per TeachOS user id (normUid) and subject. Cached 10 minutes. */
export async function fetchRecentLpActivity(force = false): Promise<Map<string, SubjectActivity[]>> {
  if (!force && lpCache && Date.now() - lpCache.at < 10 * 60 * 1000) return lpCache.data;
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT instructor_user_id AS u, REPLACE(LOWER(CAST(course_id AS STRING)), '-', '') AS cid, course_title AS t, COUNT(*) AS n, MAX(CAST(completion_datetime AS STRING)) AS d
            FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${UNIT_COMPLETION_TABLE}\`
            WHERE completion_status = 'COMPLETED' AND completion_datetime >= DATE(@since) AND instructor_user_id IS NOT NULL GROUP BY 1, 2, 3`,
    params: { since: sinceDay() },
  }), 120000);
  const acc = new Map<string, Map<string, SubjectActivity>>();
  for (const r of rows as Record<string, unknown>[]) {
    const subject = taughtSubjectColumn(plain(r.cid), plain(r.t));
    if (!subject || subject === "Other") continue;
    const uid = normUid(plain(r.u));
    const m = acc.get(uid) ?? new Map<string, SubjectActivity>();
    const x = m.get(subject) ?? { subject, count: 0, last: null };
    const d = plain(r.d).slice(0, 10) || null;
    x.count += Number(plain(r.n)) || 0;
    if (d && (!x.last || d > x.last)) x.last = d;
    m.set(subject, x); acc.set(uid, m);
  }
  const data = new Map([...acc].map(([u, m]) => [u, [...m.values()].sort((a, b) => b.count - a.count)]));
  lpCache = { at: Date.now(), data };
  return data;
}

export function learningNowOf(mapped: string | null, evs: Ev[], w: DemoWindow | undefined, lp: SubjectActivity[] | undefined,
  idx: ReturnType<typeof lectureNameIndex> = lectureNameIndex()): LearningNow {
  const since = sinceDay();
  const dm = new Map<string, SubjectActivity>();
  for (const e of evs) {
    if (!e.date || e.date < since || !demoKindOf(e.type, e.date, w).endsWith("_training")) continue;
    const subs = new Set((matchDemoTopic(idx, e.title) ?? []).map((h) => LECTURE_COURSES[h.ci].subject));
    if (subs.size !== 1) continue;
    const [subject] = subs;
    const x = dm.get(subject) ?? { subject, count: 0, last: null };
    x.count++; if (!x.last || e.date > x.last) x.last = e.date;
    dm.set(subject, x);
  }
  const byCount = (a: SubjectActivity, b: SubjectActivity) => b.count - a.count || String(b.last ?? "").localeCompare(String(a.last ?? ""));
  const demos = [...dm.values()].sort(byCount);
  const lpList = [...(lp ?? [])].sort(byCount);
  const subjects = demos.length ? demos.filter((x, k) => k === 0 || x.count >= MIN_DEMOS).map((x) => x.subject)
    : lpList.length ? [lpList[0].subject] : mapped ? [mapped] : [];
  const source = demos.length ? "demos" : lpList.length ? "learning portal" : "mapped subject";
  const reading = lpList.filter((x) => x.count >= lpList[0].count * LEARNING_SHARE && !subjects.includes(x.subject)).map((x) => x.subject);
  return { subjects, reading, source, demos, lp: lpList };
}

/** The readiness of each subject on its own (instructors with 2+ subjects), all semesters + per semester. */
export type SubjectReadiness = ReadinessBlock & { semesters: Record<string, ReadinessBlock> };
export function bySubject(subjects: string[], evs: Ev[], w: DemoWindow | undefined, exams: Record<string, ExamCell> | undefined,
  idx: ReturnType<typeof lectureNameIndex>): Record<string, SubjectReadiness> | null {
  if (subjects.length < 2) return null;
  return Object.fromEntries(subjects.map((x) => {
    const { courses, ...rest } = readinessOf([x], evs, w, exams, idx);
    void courses;
    return [x, rest];
  }));
}
