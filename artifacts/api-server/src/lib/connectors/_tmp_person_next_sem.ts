// One-off, READ-ONLY (2026-11-21, per request: "NW0004380 teaches Semester 1 now, in two subjects -- get his Semester 2 readiness for
// both subjects: learning-portal coverage of the Semester 2 courses, all topin exams, all demos, all AI assessments").
// For one employee ID and a target semester (default 2):
//   A. who: product, mapped subject, NIAT cohorts, subjects he TAUGHT in the last 60 days (Taught in Class, by course)
//   B. per subject (taught + mapped): the target semester's courses --
//      LP: stored Training - LP status (units completed / total) + live unit split by type, exam/quiz scores
//      demos / AI on that semester's lectures (same rules as Training - Readiness, all demos incl. after deployment and mock, no prep)
//      Top-N for that semester (topin; Aptitude: learning-portal exams + quizzes) and the category
//   C. every demo / AI assessment he has recorded (pre-preparedness left out), with the lecture / course / semester it matches
//   D. every topin exam he has written, with the FCC course, subject and semester
// No names printed.   pnpm exec tsx src/lib/connectors/_tmp_person_next_sem.ts NW0004380 [2]
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable, instructorTaughtCourseTable, instructorTrainingStatusTable, instructorContributionTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { config } from "./config";
import { fetchReadinessEvaluations, readinessOf, LECTURE_SEMESTER, EXAM_SEMESTER, fetchLpAptitudeScores, APTITUDE_LP_COURSES } from "./trainingReadiness";
import { fetchTopinAssessments, normUid, topinCellsFor, courseOfExam } from "./topinAssessments";
import { lectureNameIndex, matchDemoTopic } from "./demoTraining";
import { UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { TRACK_SUBJECT } from "./instructorContribution";
import { LECTURE_COURSES } from "../../data/lectureSessions";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { productOf } from "../product";

// Same as COURSE_SEMESTER in instructor-crm/src/pages/training-stats.tsx (Training - LP semester buttons).
const COURSE_SEMESTER: Record<string, number> = {
  html_css_2026: 1, static_web: 1, responsive_design: 1, modern_responsive_ui: 1, javascript_sprint: 2, javascript_essentials: 2, dynamic_web_app: 2, react_js: 3,
  python: 1, sql: 2, mongodb: 2, node_js: 3, dsa: 2, dia: 3, ips: 4, gen_ai: 1, llm: 2, ai_for_finance: 3,
  quantitative_aptitude: 1, numerical_ability: 2, logical_reasoning: 3, advanced_aptitude: 4, math_for_cs: 1, probability_statistics: 3, linear_algebra_calculus: 4,
  english_foundation: 1, english_advanced: 2, english_applied: 3,
};
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const subj = (s: string | null | undefined) => (s === "Math for Computer Science" ? "Maths" : (normalizeSubjectArea(s ?? null) as string | null) ?? s ?? null);
const colour = (v: number | null, g: number, y: number) => (v === null ? "No data" : v >= g ? "Green" : v >= y ? "Yellow" : "Red");

async function main() {
  const [emp, semArg] = process.argv.slice(2).filter((a) => a !== "--");
  const target = Number(semArg ?? 2);
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, (emp ?? "").trim().toUpperCase()));
  if (!p?.teachosUserId) { console.log(`${emp}: not in FCC or no TeachOS id`); process.exit(0); }
  const uid = normUid(p.teachosUserId);
  const mapped = subj(p.deptArea || p.manualDeptArea);
  const contrib = (await db.select().from(instructorContributionTable)).find((c) => normUid(c.instructorUserId) === uid);
  const taught = (await db.select().from(instructorTaughtCourseTable)).filter((t) => normUid(t.instructorUserId) === uid);
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  console.log(`A. ${p.employeeId} | ${productOf(p)} | mapped subject ${mapped ?? "-"} | NIAT cohorts (last 30 days): ${(contrib?.niatCohorts ?? []).join(", ") || "-"} | target semester ${target}`);
  console.log(`   Courses taught (Taught in Class), newest first:`);
  for (const t of taught.sort((a, b) => String(b.lastTaughtDate).localeCompare(String(a.lastTaughtDate)))) console.log(`     ${t.courseTitle} [${subj(t.courseSubject) ?? "-"}] | sessions ${t.sessionsCompleted} | ${t.firstTaughtDate ?? "-"} .. ${t.lastTaughtDate ?? "-"}${String(t.lastTaughtDate) >= since ? " | taught in last 60 days" : ""}`);
  const recent = [...new Set(taught.filter((t) => String(t.lastTaughtDate) >= since).map((t) => subj(t.courseSubject)).filter((s): s is string => !!s && s !== "General"))];
  const subjects = [...new Set([...recent, ...(mapped ? [mapped] : [])])];
  console.log(`   Subjects scored below: ${subjects.join(", ") || "-"}`);

  const [evs, topin, lpApt] = await Promise.all([fetchReadinessEvaluations(true), fetchTopinAssessments(true), fetchLpAptitudeScores(true)]);
  const idx = lectureNameIndex();
  const myEvs = evs.byUid.get(uid) ?? [];
  const stored = (await db.select().from(instructorTrainingStatusTable)).filter((s) => normUid(s.instructorUserId) === uid);
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [units] = await bq.query({ query: `SELECT REPLACE(LOWER(CAST(course_id AS STRING)), '-', '') AS cid, course_title AS t, unit_type AS ty, COUNT(DISTINCT unit_id) AS n,
      COUNTIF(completion_status = 'COMPLETED') AS done, COUNTIF(best_exam_percentage_score IS NOT NULL) AS scored, AVG(best_exam_percentage_score) AS avg_s
      FROM \`${P}.${DS}.${UNIT_COMPLETION_TABLE}\` WHERE REPLACE(LOWER(instructor_user_id), '-', '') = @u GROUP BY 1, 2, 3`, params: { u: uid } });

  for (const S of subjects) {
    console.log(`\nB. ${S} -- Semester ${target}`);
    const defs = TRAINING_COURSE_TAXONOMY.filter((d) => TRACK_SUBJECT[d.trackGroup] === S && COURSE_SEMESTER[d.key] === target);
    if (!defs.length) console.log(`   LP: no ${S} course in Semester ${target}`);
    for (const d of defs) {
      const st = stored.find((s) => s.courseKey === d.key);
      console.log(`   LP ${d.label}: ${st ? `${st.status} | ${st.unitsCompleted}/${st.unitsTotal} units (${st.unitsTotal ? Math.round((st.unitsCompleted / st.unitsTotal) * 100) : 0}%)` : "not started / no rows"}`);
      const ids = new Set((d.courseIds ?? []).map((x) => x.replace(/-/g, "").toLowerCase()));
      const titles = new Set((d.courseTitles ?? []).map((x) => x.trim().toLowerCase()));
      for (const u of (units as Record<string, unknown>[]).filter((u) => ids.has(plain(u.cid)) || titles.has(plain(u.t).trim().toLowerCase())))
        console.log(`      ${plain(u.t)} | ${plain(u.ty)}: ${plain(u.done)}/${plain(u.n)} completed${Number(plain(u.scored)) ? ` | ${plain(u.scored)} scored, avg ${Math.round(Number(plain(u.avg_s)) * 10) / 10}%` : ""}`);
    }
    const cells = { ...(topinCellsFor(topin.byUid.get(uid), S === "Aptitude") ?? {}), ...(lpApt.get(uid) ?? {}) };
    const r = readinessOf([S], myEvs, { joining: null, deployed: null }, cells, idx);
    const b = r.semesters[String(target)];
    if (!b) { console.log(`   Demo / AI / Top-N: no ${S} lecture list for Semester ${target}`); continue; }
    for (const c of r.courses.filter((c) => c.semester === target))
      console.log(`   Lectures ${c.title}: ${c.lectures_total} lectures | demo on ${c.demo_lectures} (avg ${c.demo_avg ?? "-"}) | AI on ${c.ai_lectures} (avg ${c.ai_avg ?? "-"}) | both ${c.both_lectures}`);
    const demo = colour(b.demo_avg, 7.5, 6.5), ai = colour(b.ai_avg, 8.5, 7.5), tn = colour(b.topn_avg, 75, 60);
    const cat = ["Red", "Yellow", "Green"][Math.min(...[demo, ai, tn].map((x) => ({ Green: 2, Yellow: 1 } as Record<string, number>)[x] ?? 0))];
    console.log(`   Semester ${target} scores: demo ${b.demo_avg ?? "-"} (${demo}, ${b.demo_lectures} lectures) | AI ${b.ai_avg ?? "-"} (${ai}, ${b.ai_lectures}) | Top-N ${b.topn_avg ?? "-"}% (${tn}, ${b.topn_exams} exams${S === "Aptitude" ? " / LP assessments" : ""}) | lectures with both ${b.both_lectures}/${b.lectures_total} | CATEGORY ${cat}`);
  }

  console.log(`\nC. Every demo / AI assessment (pre-preparedness left out): date | type | minutes | score | title | matches`);
  for (const e of [...myEvs].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const hits = [...new Map((matchDemoTopic(idx, e.title) ?? []).map((h) => { const c = LECTURE_COURSES[h.ci]; return [`${c.key}|${h.n}`, `${c.subject} / ${c.title} (Sem ${LECTURE_SEMESTER[c.key] ?? "-"}) lecture ${h.n}`]; })).values()];
    console.log(`   ${e.date ?? "-"} | ${e.type} | ${e.mins ?? "-"} | ${e.score ?? "-"} | ${e.title} | ${hits.join("; ") || "no lecture match"}`);
  }

  console.log(`\nD. Every topin exam: first attempt | Daily/Weekly | best % | title | FCC course | subject | semester`);
  const T = `\`${P}.${DS}.${process.env.TOPIN_ASSESSMENT_TABLE || "z_niat_tech_instrctor_trainee_exam_best_scores_details"}\``;
  const [ex] = await bq.query({ query: `SELECT ANY_VALUE(assessment_title) AS t, ANY_VALUE(exam_type) AS ty, MAX(assessment_best_user_percentage_score) AS s, MIN(exam_attempt_start_date) AS d
      FROM ${T} WHERE REPLACE(LOWER(instructor_user_id), '-', '') = @u GROUP BY organisation_assessment_id ORDER BY d`, params: { u: uid } });
  for (const e of ex as Record<string, unknown>[]) {
    const c = courseOfExam(plain(e.t));
    console.log(`   ${plain(e.d).slice(0, 10)} | ${plain(e.ty)} | ${Math.round(Number(plain(e.s)) * 1000) / 10} | ${plain(e.t).trim()} | ${c?.title ?? "(not counted)"} | ${c?.subject ?? "-"} | ${c ? EXAM_SEMESTER[c.key] ?? "no semester" : "-"}`);
  }
  if (mapped === "Aptitude" || subjects.includes("Aptitude")) {
    console.log(`\n   Aptitude learning-portal scores used for Top-N: ${APTITUDE_LP_COURSES.map((c) => { const x = lpApt.get(uid)?.[c.key]?.daily; return `${c.title}: ${x ? `${x.exams} units, ${x.avg}%` : "-"}`; }).join(" | ")}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
