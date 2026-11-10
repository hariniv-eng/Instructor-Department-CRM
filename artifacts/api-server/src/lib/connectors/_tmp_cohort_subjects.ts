// One-off helper, READ-ONLY (2026-11-10, per request: "cohort 2025 has no Frontend sessions in semester 3, so why 9 Frontend
// instructors?"). The Contribution tab's "Subject (from sessions)" is worked out per PERSON over all their batches, so someone teaching
// Frontend to NIAT 2026 and something else to NIAT 2025 shows Frontend for both. This works the subject out PER PERSON AND COHORT: the
// same course -> subject rules as fetchSessionSubjects() in instructorContribution.ts (copied, not changed), with sessions grouped by the
// batch's cohort. Last 30 days; a person + cohort with none uses the 30 days before that. Used by _tmp_semester_readiness.ts.
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { getSchema } from "./instructorLearningStatus";
import { SESSION_SCHEDULE_TABLE, TRACK_SUBJECT, cohortForBatch } from "./instructorContribution";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";
import { TEACHING_COURSE_SUBJECTS, TAUGHT_COURSE_TITLE_SUBJECTS } from "../../data/teachingCourseSubjects";

const ORIENTATION_TITLE = /^(intro|introduction) to (tech|software( development)?|operating systems?|os|computers?)\b|orientation|welcome webinar|webinar/i;
function subjectFromWords(text: string): string | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  if (/aptitude|reasoning|numerical ability|verbal ability/.test(t)) return "Aptitude";
  if (/english|communicat|language analytics|grammar|writing/.test(t)) return "English";
  if (/probability|statistic|linear algebra|calculus|discrete math|mathemat|\bmaths?\b/.test(t)) return "Maths";
  if (/generative ai|\bgen ?ai\b|\bllm/.test(t)) return "GenAI";
  if (/machine learning|deep learning|data science|\bdsml\b|\bml\b|data visuali|\bnlp\b/.test(t)) return "Artificial Intelligence & Emerging Technologies";
  if (/data structure|algorithm|\bdsa\b/.test(t)) return "DSA";
  if (/html|css|javascript|\bjs\b|react|frontend|front end|responsive|web design/.test(t)) return "Frontend";
  if (/python|node|backend|back end|database|dbms|sql|django|java\b|spring|express/.test(t)) return "Backend";
  return null;
}

/** TeachOS user id -> cohort ("NIAT 2025", …) -> subject -> completed lecture/practice sessions. */
export async function fetchCohortSubjects(): Promise<Map<string, Map<string, Record<string, number>>>> {
  const cols = (await getSchema(SESSION_SCHEDULE_TABLE)).map(([n]) => n);
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c)) ?? null;
  const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c)) ?? null;
  const byId = new Map<string, string>();
  for (const def of TRAINING_COURSE_TAXONOMY) {
    const subject = def.key === "math_for_cs" ? "Math for Computer Science" : TRACK_SUBJECT[def.trackGroup];
    if (subject) for (const id of def.courseIds ?? []) byId.set(id.replace(/-/g, "").toLowerCase(), subject);
  }
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `
    SELECT instructor_user_id, batch_name,
      ${idCol ? `REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '')` : "NULL"} AS course_id,
      ${titleCol ? `CAST(${titleCol} AS STRING)` : "NULL"} AS course_title,
      ${cols.includes("semester_course_title") ? "CAST(semester_course_title AS STRING)" : "NULL"} AS semester_title,
      ${cols.includes("course_category") ? "CAST(course_category AS STRING)" : "NULL"} AS category,
      IF(session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY), 'recent', 'previous') AS period,
      COUNT(*) AS sessions
    FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\`
    WHERE session_status = 'COMPLETED' AND instructor_user_id IS NOT NULL AND batch_name IS NOT NULL
      AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 60 DAY) AND session_start_datetime <= CURRENT_DATETIME()
      AND session_type IN ('LECTURE', 'PRACTICE')
    GROUP BY 1, 2, 3, 4, 5, 6, 7` });
  const recent = new Map<string, Record<string, number>>(), previous = new Map<string, Record<string, number>>();
  for (const r of rows as Array<Record<string, unknown>>) {
    const cohort = cohortForBatch(String(r.batch_name ?? ""));
    const uid = String(r.instructor_user_id ?? "");
    if (!cohort || !uid) continue;
    const courseId = r.course_id ? String(r.course_id) : "";
    const teaching = courseId && courseId in TEACHING_COURSE_SUBJECTS ? TEACHING_COURSE_SUBJECTS[courseId] : undefined;
    const byIdSubject = teaching !== undefined ? (teaching ?? "__general") : (courseId && byId.get(courseId)) || null;
    const title = r.course_title ? String(r.course_title).trim() : "";
    const semTitle = r.semester_title ? String(r.semester_title).trim() : "";
    const byName = (t: string): string | null => {
      const k = t.toLowerCase().replace(/[^a-z0-9]+/g, "");
      return !t ? null : ORIENTATION_TITLE.test(t) ? "__general" : /^(math|mathematics)forc(omputerscience|se)/.test(k) ? "Math for Computer Science" : TAUGHT_COURSE_TITLE_SUBJECTS[k] ?? subjectFromWords(t);
    };
    const subject = byIdSubject ?? byName(title) ?? byName(semTitle) ?? subjectFromWords(String(r.category ?? "")) ?? (title ? `Other: ${title}` : semTitle ? `Other: ${semTitle}` : "__unmatched");
    const target = String(r.period) === "recent" ? recent : previous;
    const key = `${uid}|${cohort}`;
    const e = target.get(key) ?? {};
    e[subject] = (e[subject] ?? 0) + Number(r.sessions ?? 0);
    target.set(key, e);
  }
  const out = new Map<string, Map<string, Record<string, number>>>();
  for (const [key, e] of [...recent, ...[...previous].filter(([k]) => !recent.has(k))]) {
    const [uid, cohort] = key.split("|");
    const m = out.get(uid) ?? new Map<string, Record<string, number>>();
    m.set(cohort, e); out.set(uid, m);
  }
  return out;
}
