// One-off, READ-ONLY (2026-11-10, per request: instructor readiness per semester and subject, for an external document).
// For the instructors teaching a semester NOW (cohort from Contribution: NIAT 2026 = semester 1, NIAT 2025 = semester 3) and, for each
// subject they teach TO THAT COHORT (2026-11-10 fix: per person AND cohort -- the Contribution column is per person, so a Frontend
// instructor of NIAT 2026 who teaches something else to NIAT 2025 used to count as Frontend in semester 3 too; see _tmp_cohort_subjects.ts.
// Every subject with >= 20% of their lecture/practice sessions with that cohort; two subjects -> both), readiness on THAT semester's
// courses of THAT subject only:
//   Learning portal  -- units completed / total units of those courses (Training - LP data, last sync); "completed" = 85% or more
//   Demos            -- different lectures of those courses demoed in recordings of 10 min or more / total lectures, and their avg QA
//   AI assessments   -- different lectures covered / total lectures, and the average AI score
//   Taught in class  -- lectures of those courses they completed with students / total lectures (Taught in Class data, last sync)
// Population: Instructor Department, product NIAT (Deployed), Role by sessions = Instructor (took a lecture in the last 30 days; mentors
// left out). Counts and percentages only -- no names.
//   pnpm exec tsx src/lib/connectors/_tmp_semester_readiness.ts            (semester 1 group on semester 1 courses, semester 3 on semester 3)
//   pnpm exec tsx src/lib/connectors/_tmp_semester_readiness.ts --next     (semester 1 group on semester 2 courses, semester 3 on semester 4)
import { gte } from "drizzle-orm";
import { db, instructorsTable, instructorContributionTable, instructorContributionDailyTable, instructorTrainingStatusTable, instructorTaughtCourseTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { fetchDemoCourseRows } from "./demoTraining";
import { LECTURE_COURSES } from "../../data/lectureSessions";
import { fetchCohortSubjects } from "./_tmp_cohort_subjects";

// Semester -> subject -> courses. lecture = lecture-list key (demos / AI / taught); lp = Training - LP course key.
type C = { name: string; lecture: string | null; lp: string | null };
const c = (name: string, lecture: string | null, lp: string | null): C => ({ name, lecture, lp });
const SEMESTERS: Record<number, Record<string, C[]>> = {
  1: { Frontend: [c("HTML & CSS", "static_web", "static_web"), c("Modern Responsive UI", "modern_responsive_ui", "modern_responsive_ui")],
       Backend: [c("Python", "python", "python")], DSA: [], GenAI: [c("Introduction to Gen AI", "gen_ai", "gen_ai")],
       Aptitude: [c("Quantitative Aptitude", "quantitative_aptitude", "quantitative_aptitude")], Maths: [c("Maths for Computer Science", "math_for_cs", "math_for_cs")],
       English: [c("Communicative English Foundation", "english_foundation", "english_foundation")] },
  2: { Frontend: [c("JavaScript Essentials", "javascript_essentials", "javascript_essentials"), c("Dynamic Web App", "dynamic_web_app", "dynamic_web_app")],
       Backend: [c("SQL", "sql", "sql"), c("MongoDB", "mongodb", "mongodb")], DSA: [c("DSA (C++)", "lecture_dsa_c", "dsa")], GenAI: [c("LLM", "llm", "llm")],
       Aptitude: [c("Numerical Ability", "numerical_ability", "numerical_ability")], Maths: [], English: [c("Communicative English Advanced", "english_advanced", "english_advanced")] },
  3: { Frontend: [c("React JS", "react_js", "react_js")], Backend: [c("Node JS", "node_js", "node_js")],
       DSA: [c("DAA", "lecture_dsa_ii_hashing_linked_lists_stacks_trees_heaps", "dia")], GenAI: [c("AI for Finance", "ai_for_finance", "ai_for_finance")],
       Aptitude: [c("Logical Reasoning", "logical_reasoning", "logical_reasoning")], Maths: [c("Probability & Statistics", "probability_statistics", "probability_statistics")],
       English: [c("Communicative English Applied", "english_applied", "english_applied")] },
  4: { Frontend: [], Backend: [], DSA: [c("IPS", "lecture_ips", "ips")], GenAI: [],
       Aptitude: [c("Advanced Aptitude", null, "advanced_aptitude")], Maths: [c("Linear Algebra & Calculus", null, "linear_algebra_calculus")],
       English: [c("Language Analytics", null, "language_analytics")] },
};
const SUBJECTS = ["Frontend", "Backend", "DSA", "GenAI", "Aptitude", "Maths", "English"];
const subjectKey = (s: string) => (/^math/i.test(s) ? "Maths" : s);
function subjectsOf(ss: Record<string, number>): string[] {
  const e = Object.entries(ss ?? {}).filter(([k]) => !k.startsWith("__") && !k.startsWith("Other: ")).sort((a, b) => b[1] - a[1]);
  const total = e.reduce((s, [, n]) => s + n, 0);
  return [...new Set(e.filter(([, n], i) => i === 0 || n / total >= 0.2).map(([k]) => subjectKey(k)))];
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

async function main() {
  const next = process.argv.includes("--next");
  const all = await db.select().from(instructorsTable);
  const r = computeDepartmentAndExceptionRows(all);
  const seen = new Set<number>();
  const pop = [...r.countedInstructorRows, ...r.mentors].filter((p) => productOf(p) === "NIAT (Deployed)" && p.teachosUserId && (seen.has(p.id) ? false : (seen.add(p.id), true)));
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((x) => [x.instructorUserId, x]));
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000); ist.setUTCDate(ist.getUTCDate() - 29);
  const lectureLast30 = new Map<string, number>();
  for (const d of await db.select().from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, ist.toISOString().slice(0, 10))))
    lectureLast30.set(d.instructorUserId, (lectureLast30.get(d.instructorUserId) ?? 0) + d.lectureSessions);
  const instructors = pop.filter((p) => (lectureLast30.get(p.teachosUserId!) ?? 0) > 0);

  const lp = new Map<string, { done: number; total: number }>();
  for (const t of await db.select().from(instructorTrainingStatusTable)) lp.set(`${t.instructorUserId}|${t.courseKey}`, { done: t.unitsCompleted, total: t.unitsTotal });
  const taught = new Map<string, { done: number; total: number }>();
  for (const t of await db.select().from(instructorTaughtCourseTable)) taught.set(`${t.instructorUserId}|${t.courseId}`, { done: t.completedSessions, total: t.curriculumSessions });
  // Demos / AI live from the QA view, all of them (no in-training / after-deployment split), 10-minute rule for demos.
  const subjectByUid = new Map(all.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, (normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) as string | null) ?? null]));
  const demo = new Map<string, { covered: number; sum: number; scored: number }>();
  const ai = new Map<string, { covered: number; sum: number; scored: number }>();
  for (const d of await fetchDemoCourseRows(subjectByUid, new Map())) {
    if (d.evaluation_kind === "demo_training") demo.set(`${d.instructor_user_id}|${d.course_key}`, { covered: d.lectures_long, sum: d.score_sum_long, scored: d.scored_long });
    if (d.evaluation_kind === "ai_training") ai.set(`${d.instructor_user_id}|${d.course_key}`, { covered: d.lectures_demoed, sum: d.score_sum, scored: d.scored });
  }
  const cohortSubjects = await fetchCohortSubjects();
  const lectureTotal = (key: string | null) => (key ? LECTURE_COURSES.find((x) => x.key === key)?.lectures.length ?? 0 : 0);

  for (const [group, cohort, ownSem] of [["SEMESTER 1 instructors", "NIAT 2026", 1], ["SEMESTER 3 instructors", "NIAT 2025", 3]] as const) {
    const sem = next ? ownSem + 1 : ownSem;
    const people = instructors.filter((p) => contrib.get(p.teachosUserId!)?.niatCohorts.includes(cohort));
    console.log(`\n=== ${group} (${cohort}): ${people.length} instructors -- readiness on SEMESTER ${sem} courses ===`);
    console.log(`Courses: ${SUBJECTS.map((s) => `${s}: ${SEMESTERS[sem][s].map((x) => x.name).join(" + ") || "-"}`).join(" | ")}`);
    console.log("subject | instructors | LP avg % | LP 85%+ (n) | LP no data (n) | demo: n with any | demo avg lectures % | demo avg QA | AI: n with any | AI avg lectures % | AI avg score | taught avg % | taught 85%+ (n)");
    const other: number[] = [];
    for (const s of SUBJECTS) {
      const group2 = people.filter((p) => subjectsOf(cohortSubjects.get(p.teachosUserId!)?.get(cohort) ?? {}).includes(s));
      const courses = SEMESTERS[sem][s];
      if (!courses.length) { console.log(`${s} | ${group2.length} | no ${s} course in semester ${sem}`); continue; }
      const lpPct: number[] = [], demoPct: number[] = [], aiPct: number[] = [], taughtPct: number[] = [];
      let lp85 = 0, lpNone = 0, demoAny = 0, aiAny = 0, taught85 = 0, dSum = 0, dScored = 0, aSum = 0, aScored = 0;
      const lectures = courses.reduce((n, x) => n + lectureTotal(x.lecture), 0);
      for (const p of group2) {
        const uid = p.teachosUserId!;
        let done = 0, total = 0;
        for (const x of courses) { const v = x.lp ? lp.get(`${uid}|${x.lp}`) : undefined; if (v) { done += v.done; total += v.total; } }
        if (total) { const v = pct(done, total); lpPct.push(v); if (v >= 85) lp85++; } else lpNone++;
        if (lectures) {
          let dc = 0, ac = 0, td = 0, tt = 0;
          for (const x of courses) {
            if (!x.lecture) continue;
            const d = demo.get(`${uid}|${x.lecture}`), a = ai.get(`${uid}|${x.lecture}`), t = taught.get(`${uid}|lecture:${x.lecture}`);
            if (d) { dc += d.covered; dSum += d.sum; dScored += d.scored; }
            if (a) { ac += a.covered; aSum += a.sum; aScored += a.scored; }
            if (t) { td += t.done; tt += t.total; }
          }
          demoPct.push(pct(dc, lectures)); aiPct.push(pct(ac, lectures)); if (dc) demoAny++; if (ac) aiAny++;
          const tv = pct(td, tt || lectures); taughtPct.push(tv); if (tv >= 85) taught85++;
        }
      }
      const f = (v: number | null) => (v === null ? "-" : String(v));
      console.log(`${s} | ${group2.length} | ${f(mean(lpPct))} | ${lp85} | ${lpNone} | ${lectures ? demoAny : "-"} | ${lectures ? f(mean(demoPct)) : "-"} | ${dScored ? (dSum / dScored).toFixed(1) : "-"} | ${lectures ? aiAny : "-"} | ${lectures ? f(mean(aiPct)) : "-"} | ${aScored ? (aSum / aScored).toFixed(1) : "-"} | ${lectures ? f(mean(taughtPct)) : "-"} | ${lectures ? taught85 : "-"}`);
      other.push(group2.length);
    }
    const noSubject = people.filter((p) => !subjectsOf(cohortSubjects.get(p.teachosUserId!)?.get(cohort) ?? {}).some((s) => SUBJECTS.includes(s))).length;
    console.log(`(instructors with none of these 7 subjects WITH THIS COHORT -- other university courses / no lecture-practice sessions: ${noSubject}; people teaching 2 subjects count in both rows)`);
  }
  console.log("\nLP / taught = last sync; demos / AI = live. Demos count only recordings of 10 minutes or more. '-' = no data or no lecture list for that course.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
