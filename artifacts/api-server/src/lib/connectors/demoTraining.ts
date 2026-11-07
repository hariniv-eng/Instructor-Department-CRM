// "Demos" view of Training Stats (2026-10-28, per request: "like Taught in class, another tab Demos -- out of a course's classes, how
// many each instructor has done a demo on, and below it the average QA score of those demos"). Source: the BigQuery view
// niat_session_wise_qa_rating, evaluation_type DEMO and TRAINING_DEMO (2026-10-28, per request: training demos -- started 6 Oct 2026 --
// count together with the regular demos; training AI assessments, AI assessments, MOCK and SCHEDULE are not counted), status Completed (any letter case). One row per (instructor, lecture-list course): lectures of the course they have a
// completed demo on, total lectures, number of demos, sum / count of final_score (0-10) for the average QA score (average of ALL their
// demos in the course, per request -- e.g. 8 demos across the 20 HTML & CSS lectures -> the average of those 8 scores), first / last date.
//
// AI assessments (2026-10-29, per request: "beside each course's demo column, an AI assessment column -- number of assessments and the
// average score"): AI_ASSESSMENT and TRAINING_AI_ASSESSMENT are aggregated the same way, as separate rows with evaluation_kind = 'ai'
// (demo rows: 'demo'). Training AI assessments count with AI assessments, as training demos do with demos.
//
// Matching a demo to a lecture: by TOPIC NAME. The demo's session_id is the QA tool's own topic ID -- it matches no learning-portal unit
// or topic (checked 2026-10-28), so unit IDs cannot be used here. The topic name is compared to the lecture names of
// data/lectureSessions.ts with demoNameKey() below (lower case, letters/digits only; "&" = "and"; both halves of a combined name like "CSS Grid - 4 (+ Flexbox vs
// Grid)" count). A name found in several courses (e.g. "Introduction" in three Aptitude courses, "Bitwise Operators" in Maths and DSA) goes
// to the course(s) of the instructor's own subject; if none fits, to the course(s) on the same tech / non-tech side; else to all of them.
//
// In training vs after deployment (2026-11-07, per request: "we only need the demos instructors gave before they started teaching ... a
// column In-training demos and a column Demos after deployment; the same for AI assessments"). Each evaluation now goes to one of four
// kinds:
//   demo_training -- every TRAINING_DEMO, plus every DEMO dated on or before the instructor's deployment date (Contribution's
//                    deployment_date = first session ever scheduled). Not deployed yet (no deployment date) -> all their DEMOs.
//   demo_deployed -- DEMO dated after the deployment date.
//   ai_training / ai_deployed -- the same for TRAINING_AI_ASSESSMENT / AI_ASSESSMENT.
// The joining date is the start of the training period; a DEMO dated BEFORE the joining date (rare -- rehires, test uploads) is kept in
// "in training" rather than dropped (so the joining date only marks the start; nothing is cut by it). A DEMO with no date: after
// deployment if the person is deployed, else in training.
import { BigQuery } from "@google-cloud/bigquery";
import { config, missing } from "./config";
import { runWithHardTimeout } from "./timeout";
import { LECTURE_COURSES } from "../../data/lectureSessions";

export class DemoTrainingError extends Error {}
export const QA_RATING_VIEW = process.env.QA_RATING_VIEW || "niat_session_wise_qa_rating";
const QUERY_TIMEOUT_MS = 120000;
const NON_TECH = new Set(["English", "Aptitude", "Maths"]);

export type DemoKind = "demo_training" | "demo_deployed" | "ai_training" | "ai_deployed";
/** TeachOS user id -> joining date and deployment date (YYYY-MM-DD; null when unknown / not deployed yet). */
export type DemoWindow = { joining: string | null; deployed: string | null };
export function demoKindOf(evaluationType: string, date: string | null, w: DemoWindow | undefined): DemoKind {
  const ai = evaluationType.endsWith("AI_ASSESSMENT");
  const training = evaluationType.startsWith("TRAINING_") || !w?.deployed || (date !== null && date <= w.deployed);
  return `${ai ? "ai" : "demo"}_${training ? "training" : "deployed"}`;
}
export type DemoCourseRow = {
  instructor_user_id: string;
  course_key: string;
  course_title: string;
  course_subject: string;
  evaluation_kind: DemoKind;
  lectures_total: number;
  lectures_demoed: number;
  demos: number;
  score_sum: number;
  scored: number;
  first_demo_date: string | null;
  last_demo_date: string | null;
};

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
// Topic-name key (2026-10-28, after the preview: 30% of demos did not match on the exact name). Both the demo topic and the lecture name go
// through it: lower case; a trailing subject tag dropped ("Factors Quant", "Linear arrangements logical reasoning", "... adv aptitude");
// a trailing "CSMCQ PPT" dropped ("LCM & HCF - CSMCQ PPT"); "&" = "and"; the word "part" dropped ("CSS Grid | Part 1" = "CSS Grid - 1");
// a plural "s" dropped ("Introduction to Database" = "Introduction to Databases"); two common misspellings fixed (Mutiples, Allegations).
const SUBJECT_TAG = /\s+(quant|logical reasoning|adv(anced)? aptitude|numerical ability)\s*$/i;
const CSMCQ = /\s*-?\s*csmcq ppt\s*$/i;
export const demoNameKey = (s: string) => s.toLowerCase().replace(SUBJECT_TAG, "").replace(CSMCQ, "").replace(/&/g, " and ")
  .replace(/mutiple/g, "multiple").replace(/allegation/g, "alligation")
  .split(/[^a-z0-9]+/).filter((w) => w && w !== "part").map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)).join("");
// Older names of the same lecture (2026-10-28): the old "Build Your Own Static Website" names of HTML & CSS lectures, and a reworded
// Modern Responsive title. [course key, lecture number, other name]
const NAME_ALIASES: [string, number, string][] = [
  ["static_web", 1, "Introduction to GenAI in Frontend Development"],
  ["static_web", 2, "Your first Frontend Project | Getting started"],
  ["modern_responsive_ui", 20, "Building a Responsive Website with Tailwind CSS"],
];
// Old-course topics (2026-11-07, per request: "these 12 topics that are not counted" -- found on NW2000396). Demos on lectures of the old
// "Static Website" / "Responsive Website" courses that have no lecture in the new HTML & CSS / Modern Responsive UI lists. They now count
// for the course (number of demos + average score), but NOT in "lectures covered" -- the course total (20 / 21) stays the new course's.
// Lecture number 0 = "extra topic, no lecture". [course key, other name]
const EXTRA_TOPICS: [string, string][] = [
  ["static_web", "Introduction to Bootstrap"],
  ["static_web", "Introduction to Bootstrap | Part 2"],
  ["static_web", "A Note on Bootstrap Versions"],
  ["static_web", "Favourite Places Section"],
  ["static_web", "Website Integration"],
  ["modern_responsive_ui", "Introduction to Responsive Web Design"],
  ["modern_responsive_ui", "Bootstrap Grid System"],
  ["modern_responsive_ui", "Bootstrap Grid System | Part 2"],
  ["modern_responsive_ui", "Bootstrap Navbar"],
  ["modern_responsive_ui", "CSS Transforms"],
  ["gen_ai", "Introduction to Generative AI"],
];

// lecture name key -> every (course index, lecture number) with that name
export function lectureNameIndex(): Map<string, { ci: number; n: number }[]> {
  const idx = new Map<string, { ci: number; n: number }[]>();
  const add = (name: string, ci: number, n: number) => {
    const parts = [name, ...name.split(/\s*\(\+\s*/).map((p) => p.replace(/\)\s*$/, ""))];
    for (const k of new Set(parts.map(demoNameKey).filter(Boolean))) {
      const list = idx.get(k) ?? [];
      if (!list.some((h) => h.ci === ci && h.n === n)) idx.set(k, [...list, { ci, n }]);
    }
  };
  LECTURE_COURSES.forEach((c, ci) => c.lectures.forEach((l) => add(l.name, ci, l.n)));
  for (const [key, n, alias] of NAME_ALIASES) { const ci = LECTURE_COURSES.findIndex((c) => c.key === key); if (ci >= 0) add(alias, ci, n); }
  // Extra topics only where the name is not already a lecture of some course (a real lecture always wins).
  for (const [key, name] of EXTRA_TOPICS) { const ci = LECTURE_COURSES.findIndex((c) => c.key === key); if (ci >= 0 && !idx.has(demoNameKey(name))) add(name, ci, 0); }
  return idx;
}
/** Lectures a demo topic name matches; a name without a number also matches the lecture's "Part 1" ("Building Social Media ... Workflow"). */
export function matchDemoTopic(idx: Map<string, { ci: number; n: number }[]>, title: string): { ci: number; n: number }[] | undefined {
  const k = demoNameKey(title);
  return k ? idx.get(k) ?? (/\d$/.test(k) ? undefined : idx.get(`${k}1`)) : undefined;
}

/** subjectByUid: TeachOS user id -> the instructor's subject (normalized, e.g. "Frontend", "English"), used only for names in several courses. */
export async function fetchDemoCourseRows(subjectByUid: Map<string, string | null> = new Map(), windowByUid: Map<string, DemoWindow> = new Map()): Promise<DemoCourseRow[]> {
  const missingKeys = missing(["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET"] as const);
  if (missingKeys.length) throw new DemoTrainingError(`BigQuery settings are not fully configured — missing: ${missingKeys.join(", ")} (check .env).`);
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const [rows] = await runWithHardTimeout(() => bq.query({
    query: `SELECT instructor_user_id AS uid, session_title AS t, final_score AS s, CAST(session_date AS STRING) AS d,
                   evaluation_type AS ty
            FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\`
            WHERE evaluation_type IN ('DEMO', 'TRAINING_DEMO', 'AI_ASSESSMENT', 'TRAINING_AI_ASSESSMENT') AND LOWER(status) = 'completed' AND instructor_user_id IS NOT NULL AND session_title IS NOT NULL`,
  }), QUERY_TIMEOUT_MS);

  const idx = lectureNameIndex();
  type Agg = { uid: string; ci: number; kind: DemoKind; lectures: Set<number>; demos: number; sum: number; scored: number; first: string | null; last: string | null };
  const agg = new Map<string, Agg>();
  for (const r of rows as Record<string, unknown>[]) {
    const uid = plain(r.uid);
    let hits = matchDemoTopic(idx, plain(r.t));
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
      const kind = demoKindOf(plain(r.ty), d, windowByUid.get(uid));
      const k = `${uid}|${ci}|${kind}`;
      const a = agg.get(k) ?? { uid, ci, kind, lectures: new Set<number>(), demos: 0, sum: 0, scored: 0, first: null, last: null };
      for (const h of hits) if (h.ci === ci && h.n > 0) a.lectures.add(h.n); // n = 0: old-course extra topic, not a lecture
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
      evaluation_kind: a.kind,
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
