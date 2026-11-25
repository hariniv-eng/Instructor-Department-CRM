// One-off, READ-ONLY (2026-11-25, per request: "readiness of the deployed instructors for the NEXT semester" -- the all-instructor
// version of _tmp_person_next_sem.ts). Who: NIAT (Deployed) people in the Instructor department. Their current semester comes from the
// NIAT cohorts they teach (NIAT 2026 = Sem 1 -> next Sem 2; NIAT 2025 = Sem 3 -> next Sem 4). Their SUBJECT comes from what they actually
// teach: every subject with completed LECTURE sessions in the last 30 days IN THAT COHORT'S BATCHES (course -> subject as in Taught in
// Class; batch -> cohort as on the Contribution tab), so someone teaching Python to NIAT 2026 and AI for Finance to NIAT 2025 gets Backend
// -> Sem 2 and GenAI -> Sem 4, not every mix. No lectures in a cohort: the mapped subject. One row per instructor x cohort x subject:
//   learning portal: stored Training - LP units completed / total on that subject's next-semester courses
//   demo / AI on the next semester's lectures, Top-N (topin; Aptitude: learning portal) -- same rules as Training - Readiness, all demos
//   (training, after deployment, mock; pre-preparedness left out); category = lowest of demo, AI, Top-N (no data = Red), LP shown only
//   role by sessions (Contribution rule) and lectures in that subject in the last 30 days
// Writes next_sem_readiness.csv (HAS NAMES): gzip it and download it, then delete both:
//   pnpm exec tsx src/lib/connectors/_tmp_next_sem_readiness.ts && gzip -kf next_sem_readiness.csv
//   rm next_sem_readiness.csv next_sem_readiness.csv.gz
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { gte } from "drizzle-orm";
import { db, instructorsTable, instructorContributionTable, instructorContributionDailyTable, instructorTrainingStatusTable } from "@workspace/db";
import { config } from "./config";
import { fetchReadinessEvaluations, readinessOf, fetchLpAptitudeScores } from "./trainingReadiness";
import { fetchTopinAssessments, normUid, topinCellsFor } from "./topinAssessments";
import { lectureNameIndex } from "./demoTraining";
import { taughtSubjectColumn } from "./taughtTraining";
import { SESSION_SCHEDULE_TABLE, TRACK_SUBJECT, cohortForBatch } from "./instructorContribution";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { productOf } from "../product";
import { departmentIdsOf } from "../../routes/reports";

// Same as COURSE_SEMESTER in instructor-crm/src/pages/training-stats.tsx (Training - LP semester buttons).
const COURSE_SEMESTER: Record<string, number> = {
  html_css_2026: 1, static_web: 1, responsive_design: 1, modern_responsive_ui: 1, javascript_sprint: 2, javascript_essentials: 2, dynamic_web_app: 2, react_js: 3,
  python: 1, sql: 2, mongodb: 2, node_js: 3, dsa: 2, dia: 3, ips: 4, gen_ai: 1, llm: 2, ai_for_finance: 3,
  quantitative_aptitude: 1, numerical_ability: 2, logical_reasoning: 3, advanced_aptitude: 4, math_for_cs: 1, probability_statistics: 3, linear_algebra_calculus: 4,
  english_foundation: 1, english_advanced: 2, english_applied: 3,
};
const NEXT: Record<string, [number, number]> = { "NIAT 2026": [1, 2], "NIAT 2025": [3, 4], "NIAT 2024": [5, 6] };
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const subj = (s: string | null | undefined) => (s === "Math for Computer Science" ? "Maths" : ((normalizeSubjectArea(s ?? null) as string | null) ?? s ?? null));
const colour = (v: number | null, g: number, y: number) => (v === null ? "No data" : v >= g ? "Green" : v >= y ? "Yellow" : "Red");
const csv = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

async function main() {
  const all = await db.select().from(instructorsTable);
  const dept = departmentIdsOf(all);
  const people = all.filter((p) => p.teachosUserId && dept.has(p.id) && productOf(p) === "NIAT (Deployed)");
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [normUid(c.instructorUserId), c]));
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const sess = new Map<string, { l: number; p: number; o: number }>();
  for (const d of await db.select().from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, since))) {
    const k = normUid(d.instructorUserId); const x = sess.get(k) ?? { l: 0, p: 0, o: 0 }; x.l += d.lectureSessions; x.p += d.practiceSessions; x.o += d.otherSessions; sess.set(k, x);
  }
  const stored = new Map<string, Map<string, { done: number; total: number }>>();
  for (const s of await db.select().from(instructorTrainingStatusTable)) {
    const k = normUid(s.instructorUserId); const m = stored.get(k) ?? new Map(); m.set(s.courseKey, { done: s.unitsCompleted, total: s.unitsTotal }); stored.set(k, m);
  }
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [colRows] = await bq.query({ query: `SELECT column_name FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t`, params: { t: SESSION_SCHEDULE_TABLE } });
  const cols = (colRows as Record<string, unknown>[]).map((r) => plain(r.column_name));
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c));
  const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c));
  const batchCol = cols.find((c) => /^batch_name$/i.test(c)) ?? cols.find((c) => /batch.*name/i.test(c));
  const [lec] = await bq.query({ query: `SELECT REPLACE(LOWER(instructor_user_id), '-', '') AS u, ${idCol ? `REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '')` : "''"} AS cid,
      ${titleCol ? `CAST(${titleCol} AS STRING)` : "''"} AS t, ${batchCol ? `CAST(${batchCol} AS STRING)` : "''"} AS b, COUNT(*) AS n FROM \`${P}.${DS}.${SESSION_SCHEDULE_TABLE}\`
      WHERE session_status = 'COMPLETED' AND session_type = 'LECTURE' AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY)
        AND session_start_datetime <= CURRENT_DATETIME() GROUP BY 1, 2, 3, 4` });
  const lecBy = new Map<string, Map<string, number>>();
  for (const r of lec as Record<string, unknown>[]) {
    const s = subj(taughtSubjectColumn(plain(r.cid), plain(r.t)));
    if (!s || s === "General" || s === "Other") continue;
    const key = `${plain(r.u)}|${cohortForBatch(plain(r.b)) ?? "?"}`;
    const m = lecBy.get(key) ?? new Map(); m.set(s, (m.get(s) ?? 0) + Number(plain(r.n))); lecBy.set(key, m);
  }
  const [evs, topin, lpApt] = await Promise.all([fetchReadinessEvaluations(true), fetchTopinAssessments(true), fetchLpAptitudeScores(true)]);
  const idx = lectureNameIndex();
  const head = ["employee_id", "name", "capability_manager", "fcc_team", "role_by_sessions", "cohort", "current_sem", "next_sem", "subject", "subject_from", "lectures_30d_in_subject",
    "lp_courses_next_sem", "lp_units_completed", "lp_units_total", "lp_pct", "lectures_next_sem", "lectures_with_demo", "demo_avg", "lectures_with_ai", "ai_avg", "lectures_with_both",
    "topn_avg_pct", "topn_exams", "demo", "ai", "topn", "category", "no_data_for"];
  const out = [head.join(",")];
  const tally = new Map<string, number>();
  for (const p of people) {
    const uid = normUid(p.teachosUserId!);
    const mapped = subj(p.deptArea || p.manualDeptArea);
    const x = sess.get(uid) ?? { l: 0, p: 0, o: 0 };
    const role = x.l > 0 ? "Instructor" : x.l + x.p + x.o > 0 ? "Mentor" : "No sessions";
    for (const cohort of contrib.get(uid)?.niatCohorts ?? []) {
      const pair = NEXT[cohort]; if (!pair) continue;
      const [cur, next] = pair;
      const taught = [...(lecBy.get(`${uid}|${cohort}`) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]);
      const subjects: [string, string, number][] = taught.length ? taught.map(([s, n]) => [s, `lectures to ${cohort} (30 days)`, n]) : mapped ? [[mapped, "mapped subject", 0]] : [];
      for (const [S, from, n] of subjects.length ? subjects : [["(no subject)", "none", 0] as [string, string, number]]) {
        const defs = TRAINING_COURSE_TAXONOMY.filter((d) => TRACK_SUBJECT[d.trackGroup] === S && COURSE_SEMESTER[d.key] === next);
        const st = stored.get(uid);
        const done = defs.reduce((a, d) => a + (st?.get(d.key)?.done ?? 0), 0), total = defs.reduce((a, d) => a + (st?.get(d.key)?.total ?? 0), 0);
        const cells = { ...(topinCellsFor(topin.byUid.get(uid), S === "Aptitude") ?? {}), ...(lpApt.get(uid) ?? {}) };
        const b = readinessOf([S], evs.byUid.get(uid) ?? [], { joining: null, deployed: null }, cells, idx).semesters[String(next)];
        const demo = colour(b?.demo_avg ?? null, 7.5, 6.5), ai = colour(b?.ai_avg ?? null, 8.5, 7.5), tn = colour(b?.topn_avg ?? null, 75, 60);
        const R: Record<string, number> = { Green: 2, Yellow: 1 };
        const cat = !b ? "Not scored (no lecture list for this subject in that semester)" : ["Red", "Yellow", "Green"][Math.min(R[demo] ?? 0, R[ai] ?? 0, R[tn] ?? 0)];
        const nod = b ? [["Demo QA", demo], ["AI assessment", ai], ["Top-N", tn]].filter(([, c]) => c === "No data").map(([k]) => k).join(", ") : "";
        tally.set(`Sem ${next} ${cat}`, (tally.get(`Sem ${next} ${cat}`) ?? 0) + 1);
        out.push([p.employeeId, p.fullName, p.teachosManager || p.manualCapabilityManager || "", p.classification === "mentor" ? "Mentor" : "Instructor", role, cohort, cur, next, S, from, n,
          defs.map((d) => d.label).join(" + "), defs.length ? done : "", defs.length ? total : "", defs.length && total ? Math.round((done / total) * 100) : defs.length ? 0 : "",
          b?.lectures_total ?? "", b?.demo_lectures ?? "", b?.demo_avg ?? "", b?.ai_lectures ?? "", b?.ai_avg ?? "", b?.both_lectures ?? "", b?.topn_avg ?? "", b?.topn_exams ?? "",
          demo, ai, tn, cat, nod].map(csv).join(","));
      }
    }
  }
  fs.writeFileSync("next_sem_readiness.csv", out.join("\n"));
  console.log(`NIAT (Deployed) people: ${people.length} | rows: ${out.length - 1}`);
  for (const [k, v] of [...tally].sort()) console.log(`  ${k}: ${v}`);
  console.log("Wrote next_sem_readiness.csv (has names). gzip -kf next_sem_readiness.csv, download the .gz, then rm next_sem_readiness.csv next_sem_readiness.csv.gz");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
