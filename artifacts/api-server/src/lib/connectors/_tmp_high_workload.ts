// One-off, READ-ONLY (2026-10-17, per request): every Contribution-tab instructor / mentor whose Workload is 9 or more, with the full
// breakdown. Same people and same formula / rounding as the Contribution tab:
//   Workload = Avg teaching hrs / day (Lecture + Practice + Other hours / days with a completed session)
//            + Learning hrs / day (time spent on training units / days with learning)
//            + Avg Demo / AI hrs (demo hours / demo evaluations + AI-assessment hours / AI evaluations)
// Period: last N days ending today (IST), default 30 -- the Contribution tab's default -- or "all" for all-time.
// Prints a tab-separated table (paste straight into Excel / Sheets). Writes nothing.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_high_workload.ts          (last 30 days, workload >= 9)
//   pnpm exec tsx src/lib/connectors/_tmp_high_workload.ts 7        (last 7 days)
//   pnpm exec tsx src/lib/connectors/_tmp_high_workload.ts all      (all-time)
//   pnpm exec tsx src/lib/connectors/_tmp_high_workload.ts 30 8     (last 30 days, workload >= 8)
import { gte } from "drizzle-orm";
import { db, instructorsTable, instructorContributionTable, instructorContributionDailyTable, instructorTimeSpentDailyTable, instructorEvaluationDailyTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";
import { isPinnedConfirmedInstructor } from "../../data/classificationOverrides";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const EXCLUDED = new Set(["excluded_other_department", "excluded_non_department_team", "excluded_ops_managers", "instructor_ops", "iit_kharagpur_team", "other_department_manual"]);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const allTime = (args[0] ?? "").toLowerCase() === "all";
  const days = allTime ? 0 : Math.max(1, Number(args[0]) || 30);
  const threshold = Number(args[1]) || 9;
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  ist.setUTCDate(ist.getUTCDate() - (days - 1));
  const from = allTime ? null : ist.toISOString().slice(0, 10);

  // Same population as the Contribution tab (Instructor Department instructors + mentors active in TeachOS).
  const all = await db.select().from(instructorsTable);
  const { countedInstructorRows, mentors } = computeDepartmentAndExceptionRows(all);
  const ids = new Set([...countedInstructorRows, ...mentors].map((r) => r.id));
  const people = all.filter((r) => r.inTeachos && ids.has(r.id) && (isPinnedConfirmedInstructor(r) || !EXCLUDED.has(r.classification ?? "")));

  type T = { lectureMin: number; practiceMin: number; otherMin: number; sessions: number; days: number };
  const teach = new Map<string, T>();
  if (allTime) {
    for (const c of await db.select().from(instructorContributionTable)) teach.set(c.instructorUserId, { lectureMin: c.lectureMinutes, practiceMin: c.practiceMinutes, otherMin: c.otherMinutes, sessions: c.sessionsCompleted, days: c.sessionDays });
  } else {
    for (const d of await db.select().from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, from!))) {
      const t = teach.get(d.instructorUserId) ?? { lectureMin: 0, practiceMin: 0, otherMin: 0, sessions: 0, days: 0 };
      t.lectureMin += d.lectureMinutes; t.practiceMin += d.practiceMinutes; t.otherMin += d.otherMinutes;
      const n = d.lectureSessions + d.practiceSessions + d.otherSessions;
      t.sessions += n; if (n > 0) t.days += 1;
      teach.set(d.instructorUserId, t);
    }
  }
  const learn = new Map<string, { secs: number; days: number }>();
  for (const t of await (from ? db.select().from(instructorTimeSpentDailyTable).where(gte(instructorTimeSpentDailyTable.activityDate, from)) : db.select().from(instructorTimeSpentDailyTable))) {
    const l = learn.get(t.instructorUserId) ?? { secs: 0, days: 0 };
    l.secs += t.seconds; l.days += 1; learn.set(t.instructorUserId, l);
  }
  const evals = new Map<string, { dS: number; dN: number; aS: number; aN: number }>();
  for (const e of await (from ? db.select().from(instructorEvaluationDailyTable).where(gte(instructorEvaluationDailyTable.sessionDate, from)) : db.select().from(instructorEvaluationDailyTable))) {
    const v = evals.get(e.instructorUserId) ?? { dS: 0, dN: 0, aS: 0, aN: 0 };
    if (e.evaluationType === "DEMO") { v.dS += e.seconds; v.dN += e.evaluations; } else { v.aS += e.seconds; v.aN += e.evaluations; }
    evals.set(e.instructorUserId, v);
  }

  const out: (string | number)[][] = [];
  for (const p of people) {
    const id = p.teachosUserId;
    if (!id) continue;
    const t = teach.get(id);
    const l = learn.get(id);
    const v = evals.get(id);
    const lectureH = r1((t?.lectureMin ?? 0) / 60), practiceH = r1((t?.practiceMin ?? 0) / 60), otherH = r1((t?.otherMin ?? 0) / 60);
    const totalH = r1(((t?.lectureMin ?? 0) + (t?.practiceMin ?? 0) + (t?.otherMin ?? 0)) / 60);
    const teachPerDay = t && t.days > 0 ? r1(totalH / t.days) : null;
    const learnH = r1((l?.secs ?? 0) / 3600);
    const learnPerDay = l && l.days > 0 ? r1(learnH / l.days) : null;
    const demoH = r1((v?.dS ?? 0) / 3600), aiH = r1((v?.aS ?? 0) / 3600);
    const evalAvg = v && v.dN + v.aN > 0 ? r2((v.dN > 0 ? v.dS / 3600 / v.dN : 0) + (v.aN > 0 ? v.aS / 3600 / v.aN : 0)) : null;
    if (teachPerDay === null && learnPerDay === null && evalAvg === null) continue;
    const workload = r2((teachPerDay ?? 0) + (learnPerDay ?? 0) + (evalAvg ?? 0));
    if (workload < threshold) continue;
    out.push([
      p.fullName, p.employeeId ?? "", p.classification === "mentor" ? "Mentor" : "Instructor", normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) ?? "", productOf(p), p.teachosManager || p.manualCapabilityManager || "",
      workload.toFixed(2), teachPerDay ?? "", learnPerDay ?? "", evalAvg !== null ? evalAvg.toFixed(2) : "",
      totalH, lectureH, practiceH, otherH, t?.sessions ?? 0, t?.days ?? 0,
      learnH, l?.days ?? 0,
      demoH, v?.dN ?? 0, aiH, v?.aN ?? 0, r1(demoH + aiH),
    ]);
  }
  out.sort((a, b) => Number(b[6]) - Number(a[6]));
  const header = ["Name", "Employee ID", "Role", "Subject", "Product", "Capability Manager",
    "Workload", "Teaching hrs / day", "Learning hrs / day", "Avg Demo / AI hrs",
    "Teaching hrs (total)", "Lecture hrs", "Practice hrs", "Other hrs", "Sessions", "Teaching days",
    "Learning hrs (total)", "Learning days",
    "Demo hrs", "Demo evaluations", "AI assessment hrs", "AI evaluations", "Demo + AI hrs (total)"];
  console.log(`\nWorkload >= ${threshold}, ${allTime ? "all-time" : `last ${days} days (since ${from})`}: ${out.length} people out of ${people.length}\n`);
  console.log(header.join("\t"));
  for (const row of out) console.log(row.join("\t"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
