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
            WHERE evaluation_type IN ('DEMO', 'TRAINING_DEMO', 'AI_ASSESSMENT', 'TRAINING_AI_ASSESSMENT') AND LOWER(status) = 'completed'
              AND instructor_user_id IS NOT NULL AND session_title IS NOT NULL`,
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

export type ReadinessCourse = { key: string; title: string; lectures_total: number; demo_lectures: number; ai_lectures: number; both_lectures: number; demo_avg: number | null; ai_avg: number | null };
export type Readiness = {
  has_lecture_list: boolean;
  lectures_total: number; demo_lectures: number; ai_lectures: number; both_lectures: number; complete: boolean;
  demo_avg: number | null; ai_avg: number | null; topn_avg: number | null; topn_exams: number;
  demo_colour: Colour; ai_colour: Colour; topn_colour: Colour; overall: "green" | "yellow" | "red";
  courses: ReadinessCourse[];
};

export function readinessOf(subject: string | null, evs: Ev[], w: DemoWindow | undefined, exams: Record<string, ExamCell> | undefined,
  idx: ReturnType<typeof lectureNameIndex> = lectureNameIndex()): Readiness {
  const own = LECTURE_COURSES.map((c, ci) => ({ c, ci })).filter((x) => subject && x.c.subject === subject);
  const ownCi = new Set(own.map((x) => x.ci));
  const best = new Map<string, { demo: number | null; ai: number | null; demoDone: boolean; aiDone: boolean }>(); // `${ci}|${n}`
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
  const courses: ReadinessCourse[] = own.map(({ c, ci }) => {
    const lec = c.lectures.map((l) => best.get(`${ci}|${l.n}`)).filter((b): b is NonNullable<typeof b> => !!b);
    return { key: c.key, title: c.title, lectures_total: c.lectures.length,
      demo_lectures: lec.filter((b) => b.demoDone).length, ai_lectures: lec.filter((b) => b.aiDone).length, both_lectures: lec.filter((b) => b.demoDone && b.aiDone).length,
      demo_avg: avg(lec.flatMap((b) => (b.demo === null ? [] : [b.demo]))), ai_avg: avg(lec.flatMap((b) => (b.ai === null ? [] : [b.ai]))) };
  });
  const all = [...best.values()];
  const demo_avg = avg(all.flatMap((b) => (b.demo === null ? [] : [b.demo])));
  const ai_avg = avg(all.flatMap((b) => (b.ai === null ? [] : [b.ai])));
  // Top-N: Daily + Weekly exams of the instructor's subject -- average best % over all those exams.
  let n = 0, sum = 0;
  for (const c of ASSESSMENT_COURSES) {
    if (c.subject !== subject) continue;
    for (const x of [exams?.[c.key]?.daily, exams?.[c.key]?.weekly]) if (x && x.avg !== null) { n += x.exams; sum += x.avg * x.exams; }
  }
  const topn_avg = n ? Math.round((sum / n) * 10) / 10 : null;
  const lectures_total = courses.reduce((a, c) => a + c.lectures_total, 0);
  const both = courses.reduce((a, c) => a + c.both_lectures, 0);
  const complete = lectures_total > 0 && both === lectures_total;
  const demo_colour = colourOf(demo_avg, READINESS_THRESHOLDS.demo), ai_colour = colourOf(ai_avg, READINESS_THRESHOLDS.ai), topn_colour = colourOf(topn_avg, READINESS_THRESHOLDS.topn);
  const rank = Math.min(RANK[demo_colour], RANK[ai_colour], RANK[topn_colour]);
  return {
    has_lecture_list: own.length > 0, lectures_total, complete, both_lectures: both,
    demo_lectures: courses.reduce((a, c) => a + c.demo_lectures, 0), ai_lectures: courses.reduce((a, c) => a + c.ai_lectures, 0),
    demo_avg, ai_avg, topn_avg, topn_exams: n, demo_colour, ai_colour, topn_colour,
    overall: rank === 2 ? "green" : rank === 1 ? "yellow" : "red", courses,
  };
}
