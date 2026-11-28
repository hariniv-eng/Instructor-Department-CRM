// Deployed - Readiness (2026-11-25, per request: "define a system for instructor readiness for the deployed instructors ... are they
// capable of taking the next semester or not" -- then "we need to add it to fcc now"). The in-training rules stay fixed; deployed
// instructors are scored with the SAME rules (readinessOf: demo, AI assessment, Top-N; lowest of the three, no data = Red) on the
// lectures / topin exams of the semester they teach NEXT, and also of the semester they teach now (for comparison).
// Who: NIAT (Deployed) instructors in the Instructor department (the route passes them in). Their semester (2026-11-28) = the CURRENT
// semester of the batches they gave lectures to in the last 60 days, from the prod sequence (fetchBatchSemesters) -- e.g. CDU Batch-1 is in
// Semester 4, KKH Batch-2 in Semester 6 -- and the next semester is that + 1. No lectures: the NIAT cohort shortcut (NIAT 2026 = Sem 1,
// 2025 = Sem 3, 2024 = Sem 5). One row per instructor x current semester x subject, with the campuses / batches behind it.
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
  // cohort: label of the batches (or the NIAT cohort when they had no lectures); campuses / batches they teach in this semester; semester_from:
  // "batch schedule" = the batches' current semester in the prod sequence, "cohort" = the NIAT 2026 / 2025 / 2024 shortcut (no lectures).
  cohort: string; campuses: string[]; batches: string[]; semester_from: "batch schedule" | "cohort"; semester_end: string | null;
  current_sem: number; next_sem: number;
  subject: string; source: "teaching" | "teaching (60 days)" | "mapped subject" | "other subject" | "none"; evidence: string | null;
  lectures_30d: number; lectures_60d: number;
  current: ReadinessBlock | null; next: ReadinessBlock | null; courses: Readiness["courses"];
};

// Current semester of every batch (2026-11-28, per request: "show tabs for the semesters running now in the universities -- Sem 1, 3, 4, 6 --
// and for each, the readiness for the NEXT semester; plus a campus filter"). From niat_schedule_details_as_per_prod_sequence: the semester
// flagged is_current_semester, else the one whose dates include today, else the latest one already started. Key: batch name, lower case.
type BatchSem = { sem: number; campus: string; end: string | null };
async function fetchBatchSemesters(bq: BigQuery, P: string, DS: string): Promise<Map<string, BatchSem>> {
  const [rows] = await runWithHardTimeout(() => bq.query({ query: `SELECT batch_name AS b, ANY_VALUE(institute_name) AS i, semester_title AS s,
      MAX(SAFE_CAST(CAST(is_current_semester AS STRING) AS INT64)) AS cur, CAST(MIN(semester_start_date) AS STRING) AS st, CAST(MAX(semester_end_date) AS STRING) AS en
    FROM \`${P}.${DS}.niat_schedule_details_as_per_prod_sequence\` WHERE institute_type = 'NIAT_OFFLINE' GROUP BY 1, 3` }), 120000);
  const today = new Date().toISOString().slice(0, 10);
  const best = new Map<string, { rank: number; st: string; v: BatchSem }>();
  for (const r of rows as Record<string, unknown>[]) {
    const sem = Number(/(\d+)/.exec(plain(r.s))?.[1] ?? NaN);
    if (!Number.isFinite(sem)) continue;
    const st = plain(r.st), en = plain(r.en);
    const rank = Number(plain(r.cur)) === 1 ? 3 : st && en && st <= today && today <= en ? 2 : st && st <= today ? 1 : 0;
    if (!rank) continue;
    const k = plain(r.b).trim().toLowerCase();
    const prev = best.get(k);
    if (!prev || rank > prev.rank || (rank === prev.rank && st > prev.st)) best.set(k, { rank, st, v: { sem, campus: plain(r.i), end: en || null } });
  }
  return new Map([...best].map(([k, x]) => [k, x.v]));
}

// Lectures per `${uid}|${current semester of the batch}` and subject (last 30 / 60 days), and the campuses / batches behind each key.
type Lectures = { by30: Map<string, Map<string, number>>; by60: Map<string, Map<string, number>>; where: Map<string, { campuses: Set<string>; batches: Set<string>; end: string | null; fromCohort: boolean }> };
let lecCache: { at: number; data: Lectures } | null = null;
/** Completed LECTURE sessions in the last 60 days per `${uid}|${semester}` and subject (30-day counts separately). Cached 10 minutes. */
async function fetchSemesterLectures(force: boolean): Promise<Lectures> {
  if (!force && lecCache && Date.now() - lecCache.at < 10 * 60 * 1000) return lecCache.data;
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [colRows] = await runWithHardTimeout(() => bq.query({ query: `SELECT column_name FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t`, params: { t: SESSION_SCHEDULE_TABLE } }), 60000);
  const cols = (colRows as Record<string, unknown>[]).map((r) => plain(r.column_name));
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c));
  const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c));
  const batchCol = cols.find((c) => /^batch_name$/i.test(c)) ?? cols.find((c) => /batch.*name/i.test(c));
  const instCol = cols.find((c) => /^institute_name$/i.test(c)) ?? cols.find((c) => /institute.*name|university/i.test(c));
  const [[rows], batchSem] = await Promise.all([runWithHardTimeout(() => bq.query({ query: `SELECT REPLACE(LOWER(instructor_user_id), '-', '') AS u,
      ${idCol ? `REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '')` : "''"} AS cid, ${titleCol ? `CAST(${titleCol} AS STRING)` : "''"} AS t,
      ${batchCol ? `CAST(${batchCol} AS STRING)` : "''"} AS b, ${instCol ? `CAST(${instCol} AS STRING)` : "''"} AS i,
      COUNTIF(session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL ${LECTURE_DAYS} DAY)) AS n, COUNT(*) AS n60
    FROM \`${P}.${DS}.${SESSION_SCHEDULE_TABLE}\`
    WHERE session_status = 'COMPLETED' AND session_type = 'LECTURE' AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL ${LECTURE_DAYS_FALLBACK} DAY)
      AND session_start_datetime <= CURRENT_DATETIME() GROUP BY 1, 2, 3, 4, 5` }), 120000), fetchBatchSemesters(bq, P, DS)]);
  const by30 = new Map<string, Map<string, number>>(), by60 = new Map<string, Map<string, number>>();
  const where: Lectures["where"] = new Map();
  const add = (m: Map<string, Map<string, number>>, k: string, s: string, n: number) => { const x = m.get(k) ?? new Map<string, number>(); x.set(s, (x.get(s) ?? 0) + n); m.set(k, x); };
  for (const r of rows as Record<string, unknown>[]) {
    const s = subj(taughtSubjectColumn(plain(r.cid), plain(r.t)));
    if (!s || s === "General" || s === "Other") continue;
    const batch = plain(r.b).trim();
    const bs = batchSem.get(batch.toLowerCase());
    // Batch not in the prod sequence: fall back to its NIAT cohort (NIAT 2026 = Sem 1, 2025 = Sem 3, 2024 = Sem 5).
    const sem = bs?.sem ?? DEPLOYED_COHORT_SEMESTERS[cohortForBatch(batch) ?? ""]?.[0];
    if (!sem) continue;
    const k = `${plain(r.u)}|${sem}`;
    if (Number(plain(r.n)) > 0) add(by30, k, s, Number(plain(r.n)));
    add(by60, k, s, Number(plain(r.n60)));
    const w = where.get(k) ?? { campuses: new Set<string>(), batches: new Set<string>(), end: null, fromCohort: false };
    w.campuses.add(bs?.campus || plain(r.i) || "(unknown campus)"); w.batches.add(batch);
    if (bs?.end && (!w.end || bs.end < w.end)) w.end = bs.end;
    if (!bs) w.fromCohort = true;
    where.set(k, w);
  }
  lecCache = { at: Date.now(), data: { by30, by60, where } };
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
  const [evs, topin, lpApt, lec] = await Promise.all([fetchReadinessEvaluations(force), fetchTopinAssessments(force), fetchLpAptitudeScores(force), fetchSemesterLectures(force)]);
  const idx = lectureNameIndex();
  const w = { joining: null, deployed: null }; // every demo counts (no in-training window for deployed instructors)
  // Semesters each instructor teaches now: from the batches of their lectures (last 60 days).
  const semsByUid = new Map<string, Set<number>>();
  for (const k of lec.by60.keys()) { const [u, sem] = k.split("|"); const set = semsByUid.get(u) ?? new Set<number>(); set.add(Number(sem)); semsByUid.set(u, set); }
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
    // No lectures in 60 days: the NIAT cohort shortcut, so they are still listed (campus unknown).
    const fromLectures = [...(semsByUid.get(uid) ?? [])].sort((a, b) => a - b);
    const sems: { cur: number; cohortLabel: string | null }[] = fromLectures.length ? fromLectures.map((cur) => ({ cur, cohortLabel: null }))
      : (contrib.get(uid)?.niatCohorts ?? []).flatMap((c) => (DEPLOYED_COHORT_SEMESTERS[c] ? [{ cur: DEPLOYED_COHORT_SEMESTERS[c][0], cohortLabel: c }] : []));
    for (const { cur, cohortLabel } of sems) {
      const next = cur + 1;
      const key = `${uid}|${cur}`;
      const t30 = lec.by30.get(key) ?? new Map<string, number>(), t60 = lec.by60.get(key) ?? new Map<string, number>();
      const where = lec.where.get(key);
      const batches = [...(where?.batches ?? [])].sort(), campuses = [...(where?.campuses ?? [])].sort();
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
          role, role_days: use60 ? LECTURE_DAYS_FALLBACK : LECTURE_DAYS,
          cohort: cohortLabel ?? (batches.length ? batches.join(", ") : `Semester ${cur}`), campuses: cohortLabel ? [] : campuses, batches,
          semester_from: cohortLabel || where?.fromCohort ? "cohort" : "batch schedule", semester_end: where?.end ?? null,
          current_sem: cur, next_sem: next,
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
