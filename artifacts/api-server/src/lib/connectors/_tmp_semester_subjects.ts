// One-off, READ-ONLY (2026-11-10, per request: "semester 1 and semester 3 -- number of instructors, then the split by subject").
// Population: Instructor Department instructors + mentors whose product is NIAT (Deployed) -- the Overview "Contribution of NIAT
// instructors & mentors" card. Cohort from Contribution: NIAT 2026 = semester 1, NIAT 2025 = semester 3.
// Role = Contribution's "Role (by sessions, last 30 days)": Instructor if they took at least one LECTURE session in the last 30 days,
// Mentor if they took only practice / other sessions, none if no sessions in the last 30 days.
// Subject = Contribution's "Subject (from sessions, last 30 days)": main subject = the one with the most completed lecture/practice
// sessions (each person once). Maths and Math for Computer Science are counted together. Counts only -- no names.
//   pnpm exec tsx src/lib/connectors/_tmp_semester_subjects.ts
import { gte } from "drizzle-orm";
import { db, instructorsTable, instructorContributionTable, instructorContributionDailyTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";
import { productOf } from "../product";

const SUBJECT_ORDER = ["Frontend", "Backend", "DSA", "GenAI", "Aptitude", "Maths", "English"];
function mainSubject(ss: Record<string, number>): string {
  const e = Object.entries(ss ?? {}).filter(([k]) => k !== "__previous_month");
  const subjects = e.filter(([k]) => !k.startsWith("__") && !k.startsWith("Other: ")).sort((a, b) => b[1] - a[1]);
  if (subjects.length) return /^math/i.test(subjects[0][0]) ? "Maths" : subjects[0][0];
  if (e.some(([k]) => k.startsWith("Other: "))) return "Other university course";
  return "No lecture/practice sessions";
}

async function main() {
  const all = await db.select().from(instructorsTable);
  const r = computeDepartmentAndExceptionRows(all);
  const seen = new Set<number>();
  const pop = [...r.countedInstructorRows, ...r.mentors].filter((p) => productOf(p) === "NIAT (Deployed)" && (seen.has(p.id) ? false : (seen.add(p.id), true)));
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [c.instructorUserId, c]));
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000); ist.setUTCDate(ist.getUTCDate() - 29);
  const last30 = new Map<string, { lecture: number; total: number }>();
  for (const d of await db.select().from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, ist.toISOString().slice(0, 10)))) {
    const t = last30.get(d.instructorUserId) ?? { lecture: 0, total: 0 };
    t.lecture += d.lectureSessions; t.total += d.lectureSessions + d.practiceSessions + d.otherSessions;
    last30.set(d.instructorUserId, t);
  }
  const roleOf = (uid: string | null) => { const t = uid ? last30.get(uid) : undefined; return !t || !t.total ? "No sessions (30 days)" : t.lecture > 0 ? "Instructor" : "Mentor"; };

  for (const [sem, cohort] of [["SEMESTER 1", "NIAT 2026"], ["SEMESTER 3", "NIAT 2025"]] as const) {
    const people = pop.filter((p) => (p.teachosUserId ? contrib.get(p.teachosUserId)?.niatCohorts ?? [] : []).includes(cohort));
    const roles = new Map<string, number>();
    const bySubject = new Map<string, { instructor: number; mentor: number; none: number }>();
    for (const p of people) {
      const role = roleOf(p.teachosUserId);
      roles.set(role, (roles.get(role) ?? 0) + 1);
      const s = mainSubject((p.teachosUserId ? contrib.get(p.teachosUserId)?.sessionSubjects : {}) as Record<string, number>);
      const c = bySubject.get(s) ?? { instructor: 0, mentor: 0, none: 0 };
      if (role === "Instructor") c.instructor++; else if (role === "Mentor") c.mentor++; else c.none++;
      bySubject.set(s, c);
    }
    console.log(`\n${sem} (${cohort}): ${people.length} people -- ${[...roles].map(([k, v]) => `${k} ${v}`).join(" | ")}`);
    console.log("  subject | instructors (by sessions) | mentors (by sessions) | no sessions in 30 days");
    const keys = [...SUBJECT_ORDER, ...[...bySubject.keys()].filter((k) => !SUBJECT_ORDER.includes(k)).sort()];
    for (const k of keys) { const c = bySubject.get(k); if (c) console.log(`  ${k} | ${c.instructor} | ${c.mentor} | ${c.none}`); }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
