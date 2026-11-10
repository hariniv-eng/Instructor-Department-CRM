// One-off, READ-ONLY (2026-11-10, per request: "Frontend instructors only -- for each Frontend course (HTML & CSS, Modern Responsive UI,
// JavaScript Essentials, Dynamic Web App, React JS), semester by semester: learning portal readiness, demos, AI assessments and sessions
// taught"). Population: NIAT Deployed, Instructor Department, Role by sessions = Instructor (a lecture in the last 30 days), whose subject
// taught to NIAT 2026 or NIAT 2025 (per cohort, see _tmp_cohort_subjects.ts) includes Frontend. Every course is reported for ALL of them,
// one course at a time. Counts and percentages only -- no names.
//   pnpm exec tsx src/lib/connectors/_tmp_frontend_readiness.ts
import { gte } from "drizzle-orm";
import { db, instructorsTable, instructorContributionTable, instructorContributionDailyTable, instructorTrainingStatusTable, instructorTaughtCourseTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { fetchDemoCourseRows } from "./demoTraining";
import { LECTURE_COURSES } from "../../data/lectureSessions";
import { fetchCohortSubjects } from "./_tmp_cohort_subjects";

const COURSES: { sem: number; name: string; key: string }[] = [
  { sem: 1, name: "HTML & CSS", key: "static_web" }, { sem: 1, name: "Modern Responsive UI", key: "modern_responsive_ui" },
  { sem: 2, name: "JavaScript Essentials", key: "javascript_essentials" }, { sem: 2, name: "Dynamic Web App", key: "dynamic_web_app" },
  { sem: 3, name: "React JS", key: "react_js" },
];
const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const avg = (xs: number[]) => (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : "-");
function teachesFrontend(ss: Record<string, number> | undefined): boolean {
  const e = Object.entries(ss ?? {}).filter(([k]) => !k.startsWith("__") && !k.startsWith("Other: ")).sort((a, b) => b[1] - a[1]);
  const total = e.reduce((s, [, n]) => s + n, 0);
  return e.some(([k, n], i) => k === "Frontend" && (i === 0 || n / total >= 0.2));
}

async function main() {
  const all = await db.select().from(instructorsTable);
  const r = computeDepartmentAndExceptionRows(all);
  const seen = new Set<number>();
  const pop = [...r.countedInstructorRows, ...r.mentors].filter((p) => productOf(p) === "NIAT (Deployed)" && p.teachosUserId && (seen.has(p.id) ? false : (seen.add(p.id), true)));
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000); ist.setUTCDate(ist.getUTCDate() - 29);
  const lecture = new Map<string, number>();
  for (const d of await db.select().from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, ist.toISOString().slice(0, 10))))
    lecture.set(d.instructorUserId, (lecture.get(d.instructorUserId) ?? 0) + d.lectureSessions);
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((x) => [x.instructorUserId, x]));
  const cs = await fetchCohortSubjects();
  const fe = pop.filter((p) => (lecture.get(p.teachosUserId!) ?? 0) > 0 && ["NIAT 2026", "NIAT 2025"].some((c) => contrib.get(p.teachosUserId!)?.niatCohorts.includes(c) && teachesFrontend(cs.get(p.teachosUserId!)?.get(c))));
  const sem1 = fe.filter((p) => teachesFrontend(cs.get(p.teachosUserId!)?.get("NIAT 2026"))).length;
  const sem3 = fe.filter((p) => teachesFrontend(cs.get(p.teachosUserId!)?.get("NIAT 2025"))).length;

  const lp = new Map<string, { done: number; total: number }>();
  for (const t of await db.select().from(instructorTrainingStatusTable)) lp.set(`${t.instructorUserId}|${t.courseKey}`, { done: t.unitsCompleted, total: t.unitsTotal });
  const taught = new Map<string, { done: number; total: number; sessions: number }>();
  for (const t of await db.select().from(instructorTaughtCourseTable)) taught.set(`${t.instructorUserId}|${t.courseId}`, { done: t.completedSessions, total: t.curriculumSessions, sessions: t.sessionsCompleted });
  const subjectByUid = new Map(all.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, (normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) as string | null) ?? null]));
  const demo = new Map<string, { covered: number; sum: number; scored: number; n: number }>(), ai = new Map<string, { covered: number; sum: number; scored: number; n: number }>();
  for (const d of await fetchDemoCourseRows(subjectByUid, new Map())) {
    const k = `${d.instructor_user_id}|${d.course_key}`;
    if (d.evaluation_kind === "demo_training") demo.set(k, { covered: d.lectures_long, sum: d.score_sum_long, scored: d.scored_long, n: d.demos - d.demos_short });
    if (d.evaluation_kind === "ai_training") ai.set(k, { covered: d.lectures_demoed, sum: d.score_sum, scored: d.scored, n: d.demos });
  }

  console.log(`FRONTEND INSTRUCTORS: ${fe.length} (teaching Frontend to semester 1 / NIAT 2026: ${sem1} | to semester 3 / NIAT 2025: ${sem3})`);
  console.log("Every course below is checked for all of them.\n");
  const report = (group: typeof fe, c: (typeof COURSES)[number], label: string) => {
    const fe = group;
    const lectures = LECTURE_COURSES.find((x) => x.key === c.key)?.lectures.length ?? 0;
    let lp85 = 0, lp50 = 0, lpLow = 0, lpNone = 0, dAny = 0, aAny = 0, t100 = 0, t50 = 0, tAny = 0, dSum = 0, dScored = 0, aSum = 0, aScored = 0;
    const dPct: number[] = [], aPct: number[] = [], tDone: number[] = [];
    let dTotal = 0, aTotal = 0;
    for (const p of fe) {
      const uid = p.teachosUserId!, k = `${uid}|${c.key}`;
      const l = lp.get(k);
      if (!l || !l.total) { lpLow++; lpNone++; } else { const v = pct(l.done, l.total); if (v >= 85) lp85++; else if (v >= 50) lp50++; else lpLow++; }
      const d = demo.get(k), a = ai.get(k), t = taught.get(`${uid}|lecture:${c.key}`);
      dPct.push(pct(d?.covered ?? 0, lectures)); aPct.push(pct(a?.covered ?? 0, lectures));
      if (d?.covered) dAny++; if (a?.covered) aAny++;
      if (d) { dSum += d.sum; dScored += d.scored; dTotal += d.n; } if (a) { aSum += a.sum; aScored += a.scored; aTotal += a.n; }
      const done = t?.done ?? 0; tDone.push(done);
      const tv = pct(done, t?.total || lectures); if (done) tAny++; if (tv >= 85) t100++; else if (tv >= 50) t50++; // 2026-11-10: "taught 85% is complete" -- t100 now = 85%+
    }
    console.log(`  demos (10+ min): ${dTotal} in total by ${dAny} instructors = ${dAny ? (dTotal / dAny).toFixed(1) : "-"} each | AI assessments: ${aTotal} in total by ${aAny} = ${aAny ? (aTotal / aAny).toFixed(1) : "-"} each`);
    console.log(`${c.sem} | ${c.name} | ${label} ${group.length} | ${lectures} | ${lp85} | ${lp50} | ${lpLow} (${lpNone}) | ${dAny} | ${avg(dPct)} | ${dScored ? (dSum / dScored).toFixed(1) : "-"} | ${aAny} | ${avg(aPct)} | ${aScored ? (aSum / aScored).toFixed(1) : "-"} | ${t100} | ${t50} | ${tAny} | ${avg(tDone)} of ${lectures}`);
  }
  console.log("semester | course | instructors | lectures | portal 85%+ | portal 50-84% | portal below 50% (no data) | demoed (any) | demo lectures avg % | demo QA /10 | AI assessed (any) | AI lectures avg % | AI score /10 | taught 85%+ | taught 50-84% | taught any | lectures taught avg (of total)");
  console.log("A. CURRENT Frontend instructors (all of them, every course):");
  for (const c of COURSES) report(fe, c, "current Frontend");
  // B (2026-11-10, per request: "React -- for the instructors who have taught React, e.g. to cohort 2025 last semester"): per course, the
  // department's NIAT Deployed instructors / mentors who have taught at least one lecture of THAT course with students (any cohort,
  // all-time), whatever they teach now.
  console.log("\nB. Everyone in the department (NIAT Deployed) who has TAUGHT the course (any cohort, any time):");
  for (const c of COURSES) report(pop.filter((p) => (taught.get(`${p.teachosUserId}|lecture:${c.key}`)?.done ?? 0) > 0), c, "taught it:");
  console.log("\nPortal + taught = last sync; demos / AI = live. Demos: recordings of 10 minutes or more only. Taught = lectures of the course completed with students.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
