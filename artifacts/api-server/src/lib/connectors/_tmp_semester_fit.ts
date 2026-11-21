// One-off, READ-ONLY (2026-11-19, per request: "check the deployed instructors against the training readiness rules for the semester they
// teach NOW -- separately for Semester 1 and Semester 3 instructors"; a review document, nothing in FCC changes).
// Who: NIAT (Deployed) instructors counted in the Instructor department, whose Contribution NIAT cohorts (last 30 days of classes) include
// NIAT 2026 (= Semester 1) and/or NIAT 2025 (= Semester 3); one row per instructor per semester.
// Scored on their mapped subject's courses of THAT semester, same rules as Training - Readiness (readinessOf):
//   demo = best demo per lecture averaged (10 min+; training, after-deployment and MOCK demos -- ALL demos, not only in-training: the
//   deployment window is left empty on purpose), AI = same for AI assessments, pre-preparedness recordings left out (the query already
//   excludes them, per request); Top-N = topin Daily + Weekly exams of that semester's courses.
//   + class QA = average final_score of their QA-rated class recordings (SCHEDULE) whose topic is a lecture of that semester's courses.
// Colours: demo 7.5 / 6.5, AI 8.5 / 7.5, Top-N 75 / 60, class QA 7.5 / 6.5; overall = lowest of the four, no data = Red.
// 2026-11-21 (per request: "share the instructor-wise semester readiness data of deployed instructors" again): now uses the same
// exam data as Training - Readiness -- Aptitude Top-N from the learning portal (exams + classroom quizzes of that semester's course),
// Aptitude instructors' topin exams all counted; adds role by sessions (Contribution rule) and the overall Aptitude / Maths assessment
// counts (topin + learning portal, all semesters).
// Writes semester_fit.csv (with names -- delete it after: rm semester_fit.csv).
//   pnpm exec tsx src/lib/connectors/_tmp_semester_fit.ts
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { gte } from "drizzle-orm";
import { db, instructorsTable, instructorContributionTable, instructorContributionDailyTable } from "@workspace/db";
import { config } from "./config";
import { fetchReadinessEvaluations, readinessOf, LECTURE_SEMESTER, fetchLpAptitudeScores, fetchLpSubjectAssessments, topinOverallOf } from "./trainingReadiness";
import { fetchTopinAssessments, normUid, topinCellsFor } from "./topinAssessments";
import { QA_RATING_VIEW, lectureNameIndex, matchDemoTopic } from "./demoTraining";
import { LECTURE_COURSES } from "../../data/lectureSessions";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";

const COHORT_SEMESTER: Record<string, number> = { "NIAT 2026": 1, "NIAT 2025": 3 };
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const colour = (v: number | null, g: number, y: number) => (v === null ? "No data" : v >= g ? "Green" : v >= y ? "Yellow" : "Red");
const RANK: Record<string, number> = { Green: 2, Yellow: 1, Red: 0, "No data": 0 };
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function main() {
  const all = await db.select().from(instructorsTable);
  const { countedInstructorRows, mentors } = computeDepartmentAndExceptionRows(all);
  const dept = new Set([...countedInstructorRows, ...mentors].map((r) => r.id));
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [normUid(c.instructorUserId), c]));
  const people = all.filter((p) => p.teachosUserId && dept.has(p.id) && productOf(p) === "NIAT (Deployed)");
  const [evs, topin, lpApt, lpSubj] = await Promise.all([fetchReadinessEvaluations(true), fetchTopinAssessments(true), fetchLpAptitudeScores(true), fetchLpSubjectAssessments(true)]);
  // Role by sessions, last 30 days (Contribution rule): Instructor if any Lecture session, Mentor if sessions but no Lecture.
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const sess = new Map<string, { l: number; p: number; o: number }>();
  for (const d of await db.select().from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, since))) {
    const k = normUid(d.instructorUserId); const x = sess.get(k) ?? { l: 0, p: 0, o: 0 }; x.l += d.lectureSessions; x.p += d.practiceSessions; x.o += d.otherSessions; sess.set(k, x);
  }
  const idx = lectureNameIndex();
  // Class QA: every QA-rated class recording (SCHEDULE), per instructor.
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [qa] = await bq.query({ query: `SELECT instructor_user_id u, session_title t, SAFE_CAST(final_score AS FLOAT64) s FROM \`${P}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\`
    WHERE evaluation_type = 'SCHEDULE' AND UPPER(status) = 'COMPLETED' AND final_score IS NOT NULL AND instructor_user_id IS NOT NULL` });
  const qaBy = new Map<string, { t: string; s: number }[]>();
  for (const r of qa as Record<string, unknown>[]) { const u = normUid(plain(r.u)); qaBy.set(u, [...(qaBy.get(u) ?? []), { t: plain(r.t), s: Number(plain(r.s)) }]); }

  const head = ["semester", "cohort", "employee_id", "name", "subject", "capability_manager", "lectures_in_semester", "lectures_with_demo", "lectures_with_ai", "lectures_with_both",
    "demo_avg", "demo", "ai_avg", "ai", "topn_avg_pct", "topn_exams", "topn", "class_qa_avg", "class_recordings", "class_qa", "overall",
    "role_by_sessions", "lecture_sessions_30d", "practice_sessions_30d", "other_sessions_30d", "overall_topin_exams", "overall_topin_avg_pct", "overall_lp_assessments", "overall_lp_avg_pct"];
  const out = [head.join(",")];
  const tally = new Map<string, number>();
  for (const p of people) {
    const uid = normUid(p.teachosUserId!);
    const cohorts = contrib.get(uid)?.niatCohorts ?? [];
    const subject = (normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) as string | null) ?? null;
    for (const cohort of cohorts) {
      const sem = COHORT_SEMESTER[cohort];
      if (!sem) continue;
      const cells = topinCellsFor(topin.byUid.get(uid), subject === "Aptitude");
      const r = readinessOf(subject ? [subject] : [], evs.byUid.get(uid) ?? [], { joining: null, deployed: null }, { ...(cells ?? {}), ...(lpApt.get(uid) ?? {}) }, idx);
      const b = r.semesters[String(sem)];
      // class QA on this semester's courses of their subject
      const scores = (qaBy.get(uid) ?? []).filter((q) => (matchDemoTopic(idx, q.t) ?? []).some((h) => { const c = LECTURE_COURSES[h.ci]; return c.subject === subject && LECTURE_SEMESTER[c.key] === sem; })).map((q) => q.s);
      const qaAvg = scores.length ? Math.round((scores.reduce((a, x) => a + x, 0) / scores.length) * 100) / 100 : null;
      const demo = colour(b?.demo_avg ?? null, 7.5, 6.5), ai = colour(b?.ai_avg ?? null, 8.5, 7.5), tn = colour(b?.topn_avg ?? null, 75, 60), cq = colour(qaAvg, 7.5, 6.5);
      const overall = !b ? "No courses for this subject in this semester" : ["Red", "Yellow", "Green"][Math.min(RANK[demo], RANK[ai], RANK[tn], RANK[cq])];
      tally.set(`Sem ${sem} ${overall}`, (tally.get(`Sem ${sem} ${overall}`) ?? 0) + 1);
      out.push([sem, cohort, p.employeeId, p.fullName, subject ?? "", p.teachosManager || p.manualCapabilityManager || "", b?.lectures_total ?? "", b?.demo_lectures ?? "", b?.ai_lectures ?? "", b?.both_lectures ?? "",
        b?.demo_avg ?? "", demo, b?.ai_avg ?? "", ai, b?.topn_avg ?? "", b?.topn_exams ?? "", tn, qaAvg ?? "", scores.length, cq, overall,
        ...(() => { const x = sess.get(uid) ?? { l: 0, p: 0, o: 0 }; return [x.l > 0 ? "Instructor" : x.l + x.p + x.o > 0 ? "Mentor" : "No sessions", x.l, x.p, x.o]; })(),
        ...(subject === "Aptitude" || subject === "Maths" ? (() => { const t = topinOverallOf(cells, subject), l = lpSubj.get(uid)?.[subject]; return [t.n, t.avg ?? "", l?.n ?? 0, l?.avg ?? ""]; })() : ["", "", "", ""])].map(csvCell).join(","));
    }
  }
  fs.writeFileSync("semester_fit.csv", out.join("\n"));
  console.log(`NIAT (Deployed) instructors: ${people.length}`);
  for (const [k, n] of [...tally].sort()) console.log(`  ${k}: ${n}`);
  console.log("Wrote semester_fit.csv (has names). Print it: cat semester_fit.csv -- then: rm semester_fit.csv");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
