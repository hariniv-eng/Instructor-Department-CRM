// Deployed - Readiness (2026-11-25, per request: "define a system for instructor readiness for the deployed instructors ... are they
// capable of taking the next semester or not" -- then "we need to add it to fcc now"). The in-training rules stay fixed; deployed
// instructors are scored with the SAME rules (readinessOf: demo, AI assessment, Top-N; lowest of the three, no data = Red) on the
// lectures / topin exams of the semester they teach NEXT, and also of the semester they teach now (for comparison).
// Who: NIAT (Deployed) instructors in the Instructor department (the route passes them in). Their semester comes from the NIAT batches
// they teach (Contribution cohorts): NIAT 2026 = Sem 1 -> next Sem 2, NIAT 2025 = Sem 3 -> Sem 4, NIAT 2024 = Sem 5 -> Sem 6.
// Subjects, one row per instructor x batch x subject:
//   1. what they teach that batch now: completed LECTURE sessions to its batches in the last 30 days (course -> subject as in Taught in
//      Class), or the last 60 days if none; their mapped subject only if no lectures in 60 days;
//   2. plus every OTHER subject with any next-semester evidence: a demo or AI assessment on one of its next-semester lectures, or a topin
//      exam of its next-semester courses (per request: "a Backend Sem 1 instructor teaching Python may teach DSA next semester -- if he
//      records demos or writes topin exams for another subject, get that data too, subject-wise"). Learning-portal work does not add one.
// Role by sessions (Contribution rule): Instructor if any Lecture session, Mentor if only practice / other; last 30 days, or 60 if none.
// Demos: all demos count (in-training, after-deployment, mock); pre-preparedness and under-10-minute demos do not (same as the scripts
// behind the Next_semester_readiness review). Learning portal: only Aptitude Top-N (exams + quizzes), as on Training - Readiness.
// Show only -- nothing is stored. Lecture data cached 10 minutes.
import { BigQuery } from "@google-cloud/bigquery";
import { gte } from "drizzle-orm";
import { db, instructorsTable, instructorContributionTable, instructorContributionDailyTable } from "@workspace/db";
import { config } from "./config";
import { runWithHardTimeout } from "./timeout";
import { LECTURE_COURSES } from "../../data/lectureSessions";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { taughtSubjectColumn } from "./taughtTraining";
import { SESSION_SCHEDULE_TABLE, cohortForBatch } from "./instructorContribution";
import { fetchTopinAssessments, normUid, topinCellsFor } from "./topinAssessments";
import { lectureNameIndex } from "./demoTraining";
import { fetchReadinessEvaluations, fetchLpAptitudeScores, readinessOf } from "./trainingReadiness";

type InstructorRow = typeof instructorsTable.$inferSelect;
type Readiness = ReturnType<typeof readinessOf>;
export type ReadinessBlock = Readiness["semesters"][string];

export const DEPLOYED_COHORT_SEMESTERS: Record<string, [number, number]> = { "NIAT 2026": [1, 2], "NIAT 2025": [3, 4], "NIAT 2024": [5, 6] };
export const LECTURE_DAYS = 30;
export const LECTURE_DAYS_FALLBACK = 60;
const ALL_SUBJECTS = [...new Set(LECTURE_COURSES.map((c) => c.subject))];
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const subj = (s: string | null | undefined) => (s === "Math for Computer Science" ? "Maths" : ((normalizeSubjectArea(s ?? null) as string | null) ?? s ?? null));

export type DeployedReadinessRow = {
  employee_id: string | null; full_name: string; capability_manager: string | null; role: "Instructor" | "Mentor" | "No sessions"; role_days: number;
  cohort: string; current_sem: number; next_sem: number;
  subject: string; source: "teaching" | "teaching (60 days)" | "mapped subject" | "other subject" | "none"; evidence: string | null;
  lectures_30d: number; lectures_60d: number;
  current: ReadinessBlock | null; next: ReadinessBlock | null; courses: Readiness["courses"];
};

type Lectures = { by30: Map<string, Map<string, number>>; by60: Map<string, Map<string, number>> };
let lecCache: { at: number; data: Lectures } | null = null;
/** Completed LECTURE sessions in the last 60 days per `${uid}|${cohort}` and subject (30-day counts separately). Cached 10 minutes. */
async function fetchCohortLectures(force: boolean): Promise<Lectures> {
  if (!force && lecCache && Date.now() - lecCache.at < 10 * 60 * 1000) return lecCache.data;
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [colRows] = await runWithHardTimeout(() => bq.query({ query: `SELECT column_name FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t`, params: { t: SESSION_SCHEDULE_TABLE } }), 60000);
  const cols = (colRows as Record<string, unknown>[]).map((r) => plain(r.column_name));
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c));
  const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c));
  const batchCol = cols.find((c) => /^batch_name$/i.test(c)) ?? cols.find((c) => /batch.*name/i.test(c));
  const [rows] = await runWithHardTimeout(() => bq.query({ query: `SELECT REPLACE(LOWER(instructor_user_id), '-', '') AS u,
      ${idCol ? `REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '')` : "''"} AS cid, ${titleCol ? `CAST(${titleCol} AS STRING)` : "''"} AS t,
      ${batchCol ? `CAST(${batchCol} AS STRING)` : "''"} AS b,
      COUNTIF(session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL ${LECTURE_DAYS} DAY)) AS n, COUNT(*) AS n60
    FROM \`${P}.${DS}.${SESSION_SCHEDULE_TABLE}\`
    WHERE session_status = 'COMPLETED' AND session_type = 'LECTURE' AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL ${LECTURE_DAYS_FALLBACK} DAY)
      AND session_start_datetime <= CURRENT_DATETIME() GROUP BY 1, 2, 3, 4` }), 120000);
  const by30 = new Map<string, Map<string, number>>(), by60 = new Map<string, Map<string, number>>();
  const add = (m: Map<string, Map<string, number>>, k: string, s: string, n: number) => { const x = m.get(k) ?? new Map<string, number>(); x.set(s, (x.get(s) ?? 0) + n); m.set(k, x); };
  for (const r of rows as Record<string, unknown>[]) {
    const s = subj(taughtSubjectColumn(plain(r.cid), plain(r.t)));
    if (!s || s === "General" || s === "Other") continue;
    const k = `${plain(r.u)}|${cohortForBatch(plain(r.b)) ?? "?"}`;
    if (Number(plain(r.n)) > 0) add(by30, k, s, Number(plain(r.n)));
    add(by60, k, s, Number(plain(r.n60)));
  }
  lecCache = { at: Date.now(), data: { by30, by60 } };
  return lecCache.data;
}

export async function buildDeployedReadiness(people: InstructorRow[], force = false): Promise<{ rows: DeployedReadinessRow[]; fetchedAt: string }> {
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [normUid(c.instructorUserId), c]));
  const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const s30 = day(LECTURE_DAYS), s60 = day(LECTURE_DAYS_FALLBACK);
  const sess30 = new Map<string, { l: number; o: number }>(), sess60 = new Map<string, { l: number; o: number }>();
  for (const d of await db.select().from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, s60))) {
    const k = normUid(d.instructorUserId);
    for (const m of String(d.sessionDate) >= s30 ? [sess30, sess60] : [sess60]) { const x = m.get(k) ?? { l: 0, o: 0 }; x.l += d.lectureSessions; x.o += d.practiceSessions + d.otherSessions; m.set(k, x); }
  }
  const [evs, topin, lpApt, lec] = await Promise.all([fetchReadinessEvaluations(force), fetchTopinAssessments(force), fetchLpAptitudeScores(force), fetchCohortLectures(force)]);
  const idx = lectureNameIndex();
  const w = { joining: null, deployed: null }; // every demo counts (no in-training window for deployed instructors)
  const rows: DeployedReadinessRow[] = [];
  for (const p of people) {
    if (!p.teachosUserId) continue;
    const uid = normUid(p.teachosUserId);
    const ev = evs.byUid.get(uid) ?? [];
    const mapped = subj(p.deptArea || p.manualDeptArea);
    const x30 = sess30.get(uid);
    const use60 = !x30 || x30.l + x30.o === 0;
    const x = (use60 ? sess60.get(uid) : x30) ?? { l: 0, o: 0 };
    const role = x.l > 0 ? "Instructor" : x.o > 0 ? "Mentor" : "No sessions";
    const plainCells = topinCellsFor(topin.byUid.get(uid), false) ?? {};
    for (const cohort of contrib.get(uid)?.niatCohorts ?? []) {
      const pair = DEPLOYED_COHORT_SEMESTERS[cohort];
      if (!pair) continue;
      const [cur, next] = pair;
      const t30 = lec.by30.get(`${uid}|${cohort}`) ?? new Map<string, number>(), t60 = lec.by60.get(`${uid}|${cohort}`) ?? new Map<string, number>();
      const subjects: { s: string; source: DeployedReadinessRow["source"]; evidence: string | null }[] =
        t30.size ? [...t30].sort((a, b) => b[1] - a[1]).map(([s]) => ({ s, source: "teaching" as const, evidence: null }))
        : t60.size ? [...t60].sort((a, b) => b[1] - a[1]).map(([s]) => ({ s, source: "teaching (60 days)" as const, evidence: null }))
        : mapped ? [{ s: mapped, source: "mapped subject", evidence: null }] : [];
      for (const X of ALL_SUBJECTS) {
        if (subjects.some((y) => y.s === X)) continue;
        const e = readinessOf([X], ev, w, plainCells, idx).semesters[String(next)];
        if (!e) continue;
        const what = [e.demo_lectures ? `${e.demo_lectures} demo` : "", e.ai_lectures ? `${e.ai_lectures} AI` : "", e.topn_exams ? `${e.topn_exams} topin` : ""].filter(Boolean);
        if (what.length) subjects.push({ s: X, source: "other subject", evidence: what.join(", ") });
      }
      if (!subjects.length) subjects.push({ s: "(no subject)", source: "none", evidence: null });
      for (const { s, source, evidence } of subjects) {
        const cells = { ...(topinCellsFor(topin.byUid.get(uid), s === "Aptitude") ?? {}), ...(lpApt.get(uid) ?? {}) };
        const rd = readinessOf([s], ev, w, cells, idx);
        rows.push({
          employee_id: p.employeeId, full_name: p.fullName, capability_manager: p.teachosManager || p.manualCapabilityManager || null,
          role, role_days: use60 ? LECTURE_DAYS_FALLBACK : LECTURE_DAYS, cohort, current_sem: cur, next_sem: next,
          subject: s, source, evidence, lectures_30d: t30.get(s) ?? 0, lectures_60d: t60.get(s) ?? 0,
          current: rd.semesters[String(cur)] ?? null, next: rd.semesters[String(next)] ?? null,
          courses: rd.courses.filter((c) => c.semester === cur || c.semester === next),
        });
      }
    }
  }
  rows.sort((a, b) => a.full_name.localeCompare(b.full_name) || a.cohort.localeCompare(b.cohort) || a.subject.localeCompare(b.subject));
  return { rows, fetchedAt: evs.fetchedAt };
}
