// One-off, READ-ONLY (2026-11-16, per request: "instructors may be mapped to one subject but be learning / practising another -- find
// the subject each instructor is learning NOW from their learning-portal activity and their latest demos, one or two subjects").
// 1. The learning-portal unit table's columns and every date / time column's range (which one tells WHEN a unit was done).
// 2. For each NIAT (Training) instructor in TeachOS: mapped subject | LP subjects of the courses they worked on in the last DAYS days
//    (by that date column; if none, their IN_PROGRESS courses) | subjects of their in-training demos / AI assessments in the last DAYS
//    days (latest date) | MISMATCH when the mapped subject is not among them. Employee IDs only, no names.
//   pnpm exec tsx src/lib/connectors/_tmp_learning_subject.ts [DAYS=30]
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable, instructorTrainingStatusTable } from "@workspace/db";
import { config } from "./config";
import { getSchema, UNIT_COMPLETION_TABLE } from "./instructorLearningStatus";
import { taughtSubjectColumn } from "./taughtTraining";
import { fetchReadinessEvaluations } from "./trainingReadiness";
import { lectureNameIndex, matchDemoTopic } from "./demoTraining";
import { normUid } from "./topinAssessments";
import { LECTURE_COURSES } from "../../data/lectureSessions";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const EXCL = new Set(["excluded_other_department", "excluded_non_department_team", "excluded_ops_managers", "instructor_ops"]);

async function main() {
  const days = Number(process.argv.slice(2).filter((a) => a !== "--")[0] ?? 30) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.${config.BIGQUERY_DATASET}.${UNIT_COMPLETION_TABLE}\``;

  // 1. columns + date ranges
  const schema = await getSchema(UNIT_COMPLETION_TABLE);
  console.log(`1. ${UNIT_COMPLETION_TABLE} columns: ${schema.map(([n, t]) => `${n}:${t}`).join(", ")}`);
  const dateCols = schema.filter(([, t]) => /DATE|TIME/i.test(t)).map(([n]) => n);
  for (const c of dateCols) {
    const [r] = await bq.query({ query: `SELECT MIN(CAST(${c} AS STRING)) lo, MAX(CAST(${c} AS STRING)) hi, COUNTIF(${c} IS NULL) empties, COUNT(*) n FROM ${T}` });
    const x = (r as Record<string, unknown>[])[0];
    console.log(`   ${c}: ${plain(x.lo).slice(0, 19)} .. ${plain(x.hi).slice(0, 19)} | empty ${plain(x.empties)} of ${plain(x.n)}`);
  }
  const when = dateCols.find((c) => /complet/i.test(c)) ?? dateCols.find((c) => /updat|last|attempt|modif/i.test(c)) ?? dateCols[0] ?? null;
  const idCol = schema.map(([n]) => n).find((c) => /^course_id$/i.test(c)) ?? null;
  console.log(`   -> using ${when ?? "(no date column: IN_PROGRESS courses instead)"} as "when", course id column ${idCol ?? "(none)"}`);

  // 2. people
  const people = (await db.select().from(instructorsTable)).filter((r) => r.inTeachos && r.teachosUserId && !EXCL.has(r.classification ?? "") && productOf(r) === "NIAT (Training)");
  const lp = new Map<string, Map<string, string>>(); // uid -> subject -> latest date
  if (when) {
    const [rows] = await bq.query({ query: `SELECT instructor_user_id u, ${idCol ? `REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '')` : "''"} cid, course_title t, MAX(CAST(${when} AS STRING)) d
      FROM ${T} WHERE completion_status != 'YET_TO_START' AND SUBSTR(CAST(${when} AS STRING), 1, 10) >= @since GROUP BY 1, 2, 3`, params: { since } });
    for (const r of rows as Record<string, unknown>[]) {
      const subj = taughtSubjectColumn(plain(r.cid), plain(r.t));
      if (!subj || subj === "Other") continue;
      const m = lp.get(normUid(plain(r.u))) ?? new Map<string, string>();
      const d = plain(r.d).slice(0, 10);
      if (!m.has(subj) || d > m.get(subj)!) m.set(subj, d);
      lp.set(normUid(plain(r.u)), m);
    }
  } else {
    const trackSubject = new Map(TRAINING_COURSE_TAXONOMY.map((c) => [c.key, c.trackGroup]));
    for (const r of await db.select().from(instructorTrainingStatusTable)) {
      if (r.status !== "IN_PROGRESS") continue;
      const m = lp.get(normUid(r.instructorUserId)) ?? new Map<string, string>();
      m.set(trackSubject.get(r.courseKey) ?? r.trackGroup, "in progress");
      lp.set(normUid(r.instructorUserId), m);
    }
  }
  const evs = await fetchReadinessEvaluations(true);
  const idx = lectureNameIndex();
  let mismatch = 0, noSignal = 0, multi = 0;
  console.log(`\n2. NIAT (Training) instructors (${people.length}) -- last ${days} days since ${since}`);
  console.log("   employee | mapped subject | LP subjects (latest) | demo / AI subjects (latest) | flag");
  for (const p of people.sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId)))) {
    const uid = normUid(p.teachosUserId!);
    const mapped = (normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) as string | null) ?? "-";
    const demo = new Map<string, string>();
    for (const e of evs.byUid.get(uid) ?? []) {
      if (!e.date || e.date < since) continue;
      for (const s of new Set((matchDemoTopic(idx, e.title) ?? []).map((h) => LECTURE_COURSES[h.ci].subject))) if (!demo.has(s) || e.date > demo.get(s)!) demo.set(s, e.date);
    }
    const lpm = lp.get(uid) ?? new Map<string, string>();
    const active = new Set([...lpm.keys(), ...demo.keys()]);
    const flag = !active.size ? "NO ACTIVITY" : !active.has(mapped) ? "MISMATCH" : active.size > 1 ? "SEVERAL" : "";
    if (flag === "NO ACTIVITY") noSignal++; else if (flag === "MISMATCH") mismatch++; else if (flag === "SEVERAL") multi++;
    const fmt = (m: Map<string, string>) => [...m].sort((a, b) => b[1].localeCompare(a[1])).map(([s, d]) => `${s} ${d}`).join(", ") || "-";
    console.log(`   ${p.employeeId ?? "?"} | ${mapped} | ${fmt(lpm)} | ${fmt(demo)} | ${flag}`);
  }
  console.log(`\n   mapped subject not in recent activity: ${mismatch} | active in several subjects: ${multi} | no activity in ${days} days: ${noSignal}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
