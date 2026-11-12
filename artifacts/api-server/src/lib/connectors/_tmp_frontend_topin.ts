// One-off, READ-ONLY (2026-11-12, per request: Frontend readiness vs the topin assessment data). Same two populations as
// _tmp_frontend_readiness.ts: A = current Frontend instructors (58), B = per course, everyone in the department (NIAT Deployed) who has
// taught at least one lecture of it. Assessment data: the trainee exam best-scores view, matched to a course by exam title (confirmed
// 2026-11-12):
//   HTML & CSS            static_website_*
//   Modern Responsive UI  modern_responsive_* / "Modern Responsive Total", responsive_web_* / "Responsive Total"
//   JavaScript Essentials JS_Essentials_*, js_sprint_*
//   Dynamic Web App       dynamic_web_* / dynamic_web_app_*, "Dynamic Total", dynamic_course_total_*
//   React JS              any title containing "react"
// Daily and Weekly exams separately: instructors who took at least one, and their average best score (%) -- each instructor's best
// score per exam (negative scores count as 0), averaged per instructor, then across instructors. Counts only, no names.
//   pnpm exec tsx src/lib/connectors/_tmp_frontend_topin.ts
import { gte } from "drizzle-orm";
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable, instructorContributionTable, instructorContributionDailyTable, instructorTaughtCourseTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows } from "../../routes/reports";
import { productOf } from "../product";
import { config } from "./config";
import { fetchCohortSubjects } from "./_tmp_cohort_subjects";

const COURSES: { name: string; key: string; re: RegExp }[] = [
  { name: "HTML & CSS (sem 1)", key: "static_web", re: /^static_website_/i },
  { name: "Modern Responsive UI (sem 1)", key: "modern_responsive_ui", re: /^(modern[_ ]responsive|responsive[_ ]web|responsive[_ ]total)/i },
  { name: "Dynamic Web App (sem 2)", key: "dynamic_web_app", re: /^(dynamic[_ ]web|dynamic[_ ]total|dynamic_course_total)/i },
  { name: "JavaScript Essentials (sem 2)", key: "javascript_essentials", re: /^(js_essentials|js_sprint_)/i },
  { name: "React JS (sem 3)", key: "react_js", re: /react/i },
];
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
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
  const taught = new Map<string, number>();
  for (const t of await db.select().from(instructorTaughtCourseTable)) taught.set(`${t.instructorUserId}|${t.courseId}`, t.completedSessions);

  // Best score per instructor per exam, per course and type.
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.niat_instructor_automation_data.z_niat_tech_instrctor_trainee_exam_best_scores_details\``;
  const [rows] = await bq.query({ query: `SELECT instructor_user_id AS u, organisation_assessment_id AS a, ANY_VALUE(assessment_title) AS t, ANY_VALUE(exam_type) AS ty, MAX(assessment_best_user_percentage_score) AS s FROM ${T} GROUP BY u, a` });
  // key `${uid}|${course}|${type}` -> scores (0-100) of each exam
  const scores = new Map<string, number[]>();
  const examCount = new Map<string, Set<string>>();
  for (const x of rows as Record<string, unknown>[]) {
    const title = plain(x.t).trim();
    const c = COURSES.find((cc) => cc.re.test(title));
    if (!c) continue;
    const ty = plain(x.ty) === "Weekly" ? "Weekly" : "Daily";
    const k = `${plain(x.u)}|${c.key}|${ty}`;
    scores.set(k, [...(scores.get(k) ?? []), Math.max(0, Number(plain(x.s)) || 0) * 100]);
    const ek = `${c.key}|${ty}`; examCount.set(ek, (examCount.get(ek) ?? new Set()).add(title));
  }
  console.log("Exam titles matched per course (distinct titles): " + COURSES.map((c) => `${c.name}: Daily ${examCount.get(`${c.key}|Daily`)?.size ?? 0}, Weekly ${examCount.get(`${c.key}|Weekly`)?.size ?? 0}`).join(" | ") + "\n");

  const report = (label: string, groupOf: (c: (typeof COURSES)[number]) => typeof pop) => {
    console.log(label);
    console.log("course | instructors | Daily: took | Daily: avg best % | Weekly: took | Weekly: avg best %");
    for (const c of COURSES) {
      const g = groupOf(c);
      const cell = (ty: string) => {
        const per = g.map((p) => scores.get(`${p.teachosUserId}|${c.key}|${ty}`)).filter((s): s is number[] => !!s && s.length > 0).map((s) => s.reduce((a, b) => a + b, 0) / s.length);
        return `${per.length} | ${per.length ? (per.reduce((a, b) => a + b, 0) / per.length).toFixed(1) + "%" : "-"}`;
      };
      console.log(`${c.name} | ${g.length} | ${cell("Daily")} | ${cell("Weekly")}`);
    }
    console.log("");
  };
  report(`A. CURRENT Frontend instructors (${fe.length}), every course:`, () => fe);
  report("B. Everyone in the department (NIAT Deployed) who has TAUGHT the course (any cohort, any time):", (c) => pop.filter((p) => (taught.get(`${p.teachosUserId}|lecture:${c.key}`) ?? 0) > 0));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
