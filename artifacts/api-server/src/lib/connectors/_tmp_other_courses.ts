// One-off, READ-ONLY (2026-11-10, per request: "what are the 'Other courses' in semester 3?"). Same population and per-cohort subject as
// _tmp_semester_readiness.ts. For the instructors of a cohort who teach that cohort none of the 7 subjects (Frontend, Backend, DSA,
// GenAI, Aptitude, Maths, English), lists what they DO teach it: each course / subject with how many of them teach it. Counts only.
//   pnpm exec tsx src/lib/connectors/_tmp_other_courses.ts              (NIAT 2025 = semester 3)
//   pnpm exec tsx src/lib/connectors/_tmp_other_courses.ts "NIAT 2026"  (semester 1)
import { gte } from "drizzle-orm";
import { db, instructorsTable, instructorContributionTable, instructorContributionDailyTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";
import { productOf } from "../product";
import { fetchCohortSubjects } from "./_tmp_cohort_subjects";

const SUBJECTS = ["Frontend", "Backend", "DSA", "GenAI", "Aptitude", "Maths", "English"];
const key = (s: string) => (/^math/i.test(s) ? "Maths" : s);
const LABEL: Record<string, string> = { __general: "Orientation / general course", __unmatched: "Session with no course name" };

async function main() {
  const cohort = process.argv.slice(2).filter((a) => a !== "--")[0] ?? "NIAT 2025";
  const all = await db.select().from(instructorsTable);
  const r = computeDepartmentAndExceptionRows(all);
  const seen = new Set<number>();
  const pop = [...r.countedInstructorRows, ...r.mentors].filter((p) => productOf(p) === "NIAT (Deployed)" && p.teachosUserId && (seen.has(p.id) ? false : (seen.add(p.id), true)));
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((x) => [x.instructorUserId, x]));
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000); ist.setUTCDate(ist.getUTCDate() - 29);
  const lecture = new Map<string, number>();
  for (const d of await db.select().from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, ist.toISOString().slice(0, 10))))
    lecture.set(d.instructorUserId, (lecture.get(d.instructorUserId) ?? 0) + d.lectureSessions);
  const cs = await fetchCohortSubjects();
  const people = pop.filter((p) => (lecture.get(p.teachosUserId!) ?? 0) > 0 && contrib.get(p.teachosUserId!)?.niatCohorts.includes(cohort));
  const counts = new Map<string, number>();
  let none = 0, noSessionsWithCohort = 0;
  for (const p of people) {
    const ss = cs.get(p.teachosUserId!)?.get(cohort) ?? {};
    const e = Object.entries(ss).filter(([, n]) => n > 0);
    const total = e.reduce((s, [, n]) => s + n, 0);
    const subjects = e.filter(([k]) => !k.startsWith("__") && !k.startsWith("Other: ")).sort((a, b) => b[1] - a[1]);
    const sTotal = subjects.reduce((s, [, n]) => s + n, 0);
    const listed = subjects.filter(([, n], i) => i === 0 || n / sTotal >= 0.2).map(([k]) => key(k));
    if (listed.some((s) => SUBJECTS.includes(s))) continue;
    none++;
    if (!total) { noSessionsWithCohort++; continue; }
    for (const [k] of e) { const name = k.startsWith("Other: ") ? k.slice(7) : LABEL[k] ?? k; counts.set(name, (counts.get(name) ?? 0) + 1); }
  }
  console.log(`${cohort}: ${none} instructors teach this cohort none of the 7 subjects`);
  console.log(`  of them, ${noSessionsWithCohort} have NO lecture/practice session with a ${cohort} batch in the last 60 days (only exams / other session types, or the cohort comes from an older batch)`);
  console.log(`\nWhat the others teach this cohort (course or subject -> number of instructors; one person can teach several):`);
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${k} | ${n}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
