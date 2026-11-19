// One-off, READ-ONLY (2026-11-19, per request: add Contribution's "Role (by sessions, last 30 days)" to the semester-fit report).
// Same rule as the Contribution tab: completed sessions in the last 30 days (instructor_contribution_daily) -- Instructor if any Lecture
// session, Mentor if sessions but no Lecture, blank if none. All NIAT (Deployed) instructors in the department. Employee IDs only.
//   pnpm exec tsx src/lib/connectors/_tmp_role_by_sessions.ts > role_by_sessions.csv; cat role_by_sessions.csv
import { gte } from "drizzle-orm";
import { db, instructorsTable, instructorContributionDailyTable } from "@workspace/db";
import { productOf } from "../product";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";

async function main() {
  const all = await db.select().from(instructorsTable);
  const { countedInstructorRows, mentors } = computeDepartmentAndExceptionRows(all);
  const dept = new Set([...countedInstructorRows, ...mentors].map((r) => r.id));
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const daily = await db.select().from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, since));
  const by = new Map<string, { l: number; p: number; o: number }>();
  for (const d of daily) { const x = by.get(d.instructorUserId) ?? { l: 0, p: 0, o: 0 }; x.l += d.lectureSessions; x.p += d.practiceSessions; x.o += d.otherSessions; by.set(d.instructorUserId, x); }
  console.log("employee_id,role_by_sessions,lecture_sessions_30d,practice_sessions_30d,other_sessions_30d,fcc_team");
  for (const p of all.filter((r) => r.teachosUserId && dept.has(r.id) && productOf(r) === "NIAT (Deployed)")) {
    const x = by.get(p.teachosUserId!) ?? { l: 0, p: 0, o: 0 };
    const role = x.l > 0 ? "Instructor" : x.l + x.p + x.o > 0 ? "Mentor" : "";
    console.log([p.employeeId, role, x.l, x.p, x.o, p.classification === "mentor" ? "Mentor" : "Instructor"].join(","));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
