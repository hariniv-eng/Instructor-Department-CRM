// "Demos" view of Training Stats (2026-10-28, per request: "like Taught in class, another tab Demos -- out of a course's classes, how
// many each instructor has done a demo on, and below it the average QA score of those demos"). Source: the BigQuery view
// niat_session_wise_qa_rating, evaluation_type = 'DEMO' only (per request -- TRAINING_DEMO, MOCK, SCHEDULE, AI assessments are not
// counted), status Completed (any letter case). One row per (instructor, lecture-list course): lectures of the course they have a
// completed demo on, total lectures, number of demos, sum / count of final_score (0-10) for the average QA score (average of ALL their
// demos in the course, per request -- e.g. 8 demos across the 20 HTML & CSS lectures -> the average of those 8 scores), first / last date.
//
// Matching a demo to a lecture: by TOPIC NAME. The demo's session_id is the QA tool's own topic ID -- it matches no learning-portal unit
// or topic (checked 2026-10-28), so unit IDs cannot be used here. The topic name is compared to the lecture names of
// data/lectureSessions.ts (lower case, letters/digits only; "&" = "and"; both halves of a combined name like "CSS Grid - 4 (+ Flexbox vs
// Grid)" count). A name found in several courses (e.g. "Introduction" in three Aptitude courses, "Bitwise Operators" in Maths and DSA) goes
// to the course(s) of the instructor's own subject; if none fits, to the course(s) on the same tech / non-tech side; else to all of them.
import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout } from "./timeout";
import { LECTURE_COURSES } from "../../data/lectureSessions";

export class DemoTrainingError extends Error {}
export const QA_RATING_VIEW = process.env.QA_RATING_VIEW || "niat_session_wise_qa_rating";
const QUERY_TIMEOUT_MS = 120000;
const NON_TECH = new Set(["English", "Aptitude", "Maths"]);

export type DemoCourseRow = {
  instructor_user_id: string;
  course_key: string;
  course_title: string;
  course_subject: string;
  lectures_total: number;
  lectures_demoed: number;
  demos: number;
  score_sum: number;
  scored: number;
  first_demo_date: string | null;
  last_demo_date: string | null;
};

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
export const demoNameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

// lecture name key -> every (course index, lecture number) with that name
function lectureNameIndex(): Map<string, { ci: number; n: number }[]> {
  const idx = new Map<string, { ci: number; n: number }[]>();
  LECTURE_COURSES.forEach((c, ci) => c.lectures.forEach((l) => {
    const parts = [l.name, ...l.name.split(/\s*\(\+\s*/).map((p) => p.replace(/\)\s*$/, ""))];
    for (const k of new Set(parts.map(demoNameKey).filter(Boolean))) idx.set(k, [...(idx.get(k) ?? []), { ci, n: l.n }]);
  }));
  return idx;
}

/** subjectByUid: TeachOS user id -> the instructor's subject (normalized, e.g. "Frontend", "English"), used only for names in several courses. */
export async function fetchDemoCourseRows(subjectByUid: Map<string, string | null> = new Map()): Promise<DemoCourseRow[]> {
  const missingKeys = missing(["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET"] as const);
  if (missingKeys.length) throw new DemoTrainingError(`BigQuery settings are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const [rows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT instructor_user_id AS uid, session_title AS t, final_score AS s, CAST(session_date AS STRING) AS d
            FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\`
            WHERE evaluation_type = 'DEMO' AND LOWER(status) = 'completed' AND instructor_user_id IS NOT NULL AND session_title IS NOT NULL`,
  }), QUERY_TIMEOUT_MS);

  const idx = lectureNameIndex();
  type Agg = { uid: string; ci: number; lectures: Set<number>; demos: number; sum: number; scored: number; first: string | null; last: string | null };
  const agg = new Map<string, Agg>();
  for (const r of rows as Record<string, unknown>[]) {
    const uid = plain(r.uid);
    let hits = idx.get(demoNameKey(plain(r.t)));
    if (!uid || !hits) continue;
    if (new Set(hits.map((h) => h.ci)).size > 1) {
      const area = subjectByUid.get(uid) ?? null;
      const own = area ? hits.filter((h) => LECTURE_COURSES[h.ci].subject === area) : [];
      const side = area ? hits.filter((h) => NON_TECH.has(LECTURE_COURSES[h.ci].subject) === NON_TECH.has(area)) : [];
      hits = own.length ? own : side.length ? side : hits;
    }
    const score = r.s === null || r.s === undefined || plain(r.s) === "" ? null : Number(plain(r.s));
    const d = plain(r.d) || null;
    for (const ci of new Set(hits.map((h) => h.ci))) {
      const k = `${uid}|${ci}`;
      const a = agg.get(k) ?? { uid, ci, lectures: new Set<number>(), demos: 0, sum: 0, scored: 0, first: null, last: null };
      for (const h of hits) if (h.ci === ci) a.lectures.add(h.n);
      a.demos++;
      if (score !== null && Number.isFinite(score)) { a.sum += score; a.scored++; }
      if (d && (!a.first || d < a.first)) a.first = d;
      if (d && (!a.last || d > a.last)) a.last = d;
      agg.set(k, a);
    }
  }
  return [...agg.values()].map((a) => {
    const c = LECTURE_COURSES[a.ci];
    return {
      instructor_user_id: a.uid,
      course_key: c.key,
      course_title: c.title,
      course_subject: c.subject,
      lectures_total: c.lectures.length,
      lectures_demoed: Math.min(a.lectures.size, c.lectures.length),
      demos: a.demos,
      score_sum: Math.round(a.sum * 100) / 100,
      scored: a.scored,
      first_demo_date: a.first,
      last_demo_date: a.last,
    };
  });
}
