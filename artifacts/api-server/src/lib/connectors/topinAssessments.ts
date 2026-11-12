// Training - Assessments (2026-11-12, per request: "get the topin assessment data into FCC", all subjects). Reads the trainee exam
// best-scores view (z_niat_tech_instrctor_trainee_exam_best_scores_details -- one row per instructor x exam x unit, best attempt) LIVE
// and sums it up per instructor and course: Daily and Weekly exams separately -- how many exams they took and their average best score
// (%). The view has no course column, so each exam is matched to a course by its TITLE (rules below, first match wins; mapping agreed
// 2026-11-12 from _tmp_topin_prefixes.ts). Exams that match no rule (mock tests, entry tests, daily quizzes, per-batch "B4W7_Testing"
// style tests ...) are not counted. Cached for 10 minutes.
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

export type AssessmentCourse = { key: string; title: string; subject: string; re: RegExp };
// subject = the Training Stats subject button (TAUGHT_SUBJECT_COLUMNS names). "General" columns = exams on a whole subject, not one course.
export const ASSESSMENT_COURSES: AssessmentCourse[] = [
  { key: "static_web", title: "Static Web", subject: "Frontend", re: /^static_website_|^static total$/i },
  { key: "responsive_design", title: "Responsive Design", subject: "Frontend", re: /^responsive[_ ]web|^responsive total$|responsive website/i },
  { key: "modern_responsive_ui", title: "Modern Responsive UI", subject: "Frontend", re: /^modern[_ ]responsive/i },
  { key: "javascript_sprint", title: "JavaScript Sprint", subject: "Frontend", re: /^js_sprint_/i },
  { key: "javascript_essentials", title: "JavaScript Essentials", subject: "Frontend", re: /^js_essentials/i },
  { key: "dynamic_web_app", title: "Dynamic Web App", subject: "Frontend", re: /^dynamic[_ ]web|^dynamic total$|^dynamic_course_total/i },
  { key: "react_js", title: "React JS", subject: "Frontend", re: /react/i },
  { key: "frontend_general", title: "General Frontend exams", subject: "Frontend", re: /frontend|front end|html|css|javascript|(^|[^a-z])js([^a-z]|$)|web dev|web technolog/i },
  { key: "python", title: "Python", subject: "Backend", re: /^python|complete python|fortnight.*python/i },
  { key: "sql", title: "SQL", subject: "Backend", re: /^databases_|complete sql|^sql total|(^|[^a-z])sql([^a-z]|$)/i },
  { key: "node_js", title: "Node JS", subject: "Backend", re: /node/i },
  { key: "mongodb", title: "MongoDB", subject: "Backend", re: /mongo/i },
  { key: "backend_general", title: "General Backend exams", subject: "Backend", re: /backend|back end/i },
  { key: "dsa", title: "DSA", subject: "DSA", re: /(^|[^a-z])dsa([^a-z]|$)/i },
  { key: "gen_ai", title: "Gen AI", subject: "GenAI", re: /generative ai|(^|[^a-z])gen ?ai([^a-z]|$)|(^|[^a-z])llm([^a-z]|$)/i },
  { key: "math_for_cs", title: "Mathematics for Computer Science", subject: "Maths", re: /mfcs|mathematics for computer/i },
  { key: "linear_algebra_calculus", title: "Linear Algebra and Calculus", subject: "Maths", re: /eigen|determinant|row reduction|linear system|systems of equations|la & c|rank by|calculus|matri/i },
  { key: "probability_statistics", title: "Probability and Statistics", subject: "Maths", re: /probab|statistic/i },
  { key: "maths_general", title: "General Maths exams", subject: "Maths", re: /math|surds|roots|equation|numerical method/i },
  { key: "aptitude_general", title: "Aptitude exams", subject: "Aptitude", re: /aptitude|(^|[^a-z])apti|apty|quantitative|reasoning/i },
  { key: "english_general", title: "English exams", subject: "English", re: /english/i },
];
export const courseOfExam = (title: string): AssessmentCourse | null => ASSESSMENT_COURSES.find((c) => c.re.test(title.trim())) ?? null;

export type ExamStat = { exams: number; avg: number | null; last_date: string | null };
export type ExamCell = { daily: ExamStat | null; weekly: ExamStat | null };
// uid (TeachOS user id, lower case, no dashes) -> course key -> cell
export type TopinData = { byUid: Map<string, Record<string, ExamCell>>; fetchedAt: string };

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
export const normUid = (u: string) => u.toLowerCase().replace(/-/g, "").trim();
let cache: { at: number; data: TopinData } | null = null;

export async function fetchTopinAssessments(force = false): Promise<TopinData> {
  if (!force && cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.data;
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const table = process.env.TOPIN_ASSESSMENT_TABLE || "z_niat_tech_instrctor_trainee_exam_best_scores_details";
  const T = `\`${P}.${config.BIGQUERY_DATASET}.${table}\``;
  // One row per instructor x exam: its title, Daily / Weekly, best score (0-1) and last attempt date.
  const [rows] = await bq.query({ query: `SELECT instructor_user_id AS u, organisation_assessment_id AS a, ANY_VALUE(assessment_title) AS t, ANY_VALUE(exam_type) AS ty,
      MAX(assessment_best_user_percentage_score) AS s, MAX(exam_attempt_start_date) AS d FROM ${T} GROUP BY u, a` });
  const acc = new Map<string, { n: number; sum: number; last: string | null }>(); // `${uid}|${course}|${daily|weekly}`
  for (const r of rows as Record<string, unknown>[]) {
    const c = courseOfExam(plain(r.t));
    if (!c) continue;
    const k = `${normUid(plain(r.u))}|${c.key}|${plain(r.ty) === "Weekly" ? "weekly" : "daily"}`;
    const score = Math.min(100, Math.max(0, (Number(plain(r.s)) || 0) * 100));
    const d = plain(r.d).slice(0, 10) || null;
    const x = acc.get(k) ?? { n: 0, sum: 0, last: null };
    x.n += 1; x.sum += score; if (d && (!x.last || d > x.last)) x.last = d;
    acc.set(k, x);
  }
  const byUid = new Map<string, Record<string, ExamCell>>();
  for (const [k, x] of acc) {
    const [uid, course, type] = k.split("|");
    const cells = byUid.get(uid) ?? {};
    const cell = cells[course] ?? { daily: null, weekly: null };
    cell[type as "daily" | "weekly"] = { exams: x.n, avg: x.n ? Math.round((x.sum / x.n) * 10) / 10 : null, last_date: x.last };
    cells[course] = cell;
    byUid.set(uid, cells);
  }
  const data = { byUid, fetchedAt: new Date().toISOString() };
  cache = { at: Date.now(), data };
  return data;
}
