// One-off, READ-ONLY (2026-11-28, per request: "get me the data of what the instructors teach in their current semester -- what subjects
// do they have in it"). NIAT (Deployed) instructors in the Instructor department. From the session schedule table, every completed LECTURE
// in the last 60 days, by course and batch; the batch's CURRENT semester from the prod sequence (same rule as Deployed - Readiness:
// is_current_semester, else today's dates, else latest started); the course's FCC subject (taughtSubjectColumn, same rule). One row per
// instructor x current semester: campus, batches, subjects taught (lectures each), courses taught, plus their FCC mapped subject and whether
// it is among the subjects they teach. Writes current_sem_teaching.csv (HAS NAMES -- gzip, download, then delete both).
//   pnpm exec tsx src/lib/connectors/_tmp_current_sem_teaching.ts && gzip -kf current_sem_teaching.csv
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { taughtSubjectColumn } from "./taughtTraining";
import { normUid } from "./topinAssessments";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { departmentIdsOf } from "../../routes/reports";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const csv = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const subj = (s: string | null | undefined) => (s === "Math for Computer Science" ? "Maths" : ((normalizeSubjectArea(s ?? null) as string | null) ?? s ?? null));

async function main() {
  const all = await db.select().from(instructorsTable);
  const dept = departmentIdsOf(all);
  const people = new Map(all.filter((p) => p.teachosUserId && dept.has(p.id) && productOf(p) === "NIAT (Deployed)").map((p) => [normUid(p.teachosUserId!), p]));
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [colRows] = await bq.query({ query: `SELECT column_name FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t`, params: { t: SESSION_SCHEDULE_TABLE } });
  const cols = (colRows as Record<string, unknown>[]).map((r) => plain(r.column_name));
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c));
  const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c));
  const batchCol = cols.find((c) => /^batch_name$/i.test(c)) ?? cols.find((c) => /batch.*name/i.test(c));
  const [lec] = await bq.query({ query: `SELECT REPLACE(LOWER(instructor_user_id), '-', '') AS u, REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '') AS cid,
      CAST(${titleCol} AS STRING) AS t, CAST(${batchCol} AS STRING) AS b,
      COUNTIF(session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY)) AS n30, COUNT(*) AS n60
    FROM \`${P}.${DS}.${SESSION_SCHEDULE_TABLE}\`
    WHERE session_status = 'COMPLETED' AND session_type = 'LECTURE' AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 60 DAY)
      AND session_start_datetime <= CURRENT_DATETIME() GROUP BY 1, 2, 3, 4` });
  const [semRows] = await bq.query({ query: `SELECT batch_name AS b, ANY_VALUE(institute_name) AS i, semester_title AS s,
      MAX(SAFE_CAST(CAST(is_current_semester AS STRING) AS INT64)) AS cur, CAST(MIN(semester_start_date) AS STRING) AS st, CAST(MAX(semester_end_date) AS STRING) AS en
    FROM \`${P}.${DS}.niat_schedule_details_as_per_prod_sequence\` WHERE institute_type = 'NIAT_OFFLINE' GROUP BY 1, 3` });
  const today = new Date().toISOString().slice(0, 10);
  const batchSem = new Map<string, { sem: number; campus: string; end: string; rank: number; st: string }>();
  for (const r of semRows as Record<string, unknown>[]) {
    const sem = Number(/(\d+)/.exec(plain(r.s))?.[1] ?? NaN), st = plain(r.st), en = plain(r.en);
    const rank = Number(plain(r.cur)) === 1 ? 3 : st && en && st <= today && today <= en ? 2 : st && st <= today ? 1 : 0;
    if (!rank || !Number.isFinite(sem)) continue;
    const k = plain(r.b).trim().toLowerCase(), prev = batchSem.get(k);
    if (!prev || rank > prev.rank || (rank === prev.rank && st > prev.st)) batchSem.set(k, { sem, campus: plain(r.i), end: en, rank, st });
  }
  type Acc = { campuses: Set<string>; batches: Set<string>; subjects: Map<string, number>; courses: Map<string, number>; n30: number; n60: number; end: string };
  const acc = new Map<string, Acc>();
  let unknownBatch = 0;
  for (const r of lec as Record<string, unknown>[]) {
    const u = plain(r.u);
    if (!people.has(u)) continue;
    const b = plain(r.b).trim(), bs = batchSem.get(b.toLowerCase());
    if (!bs) { unknownBatch += Number(plain(r.n60)); continue; }
    const s = subj(taughtSubjectColumn(plain(r.cid), plain(r.t))) ?? "(orientation / general)";
    const k = `${u}|${bs.sem}`;
    const a = acc.get(k) ?? { campuses: new Set(), batches: new Set(), subjects: new Map(), courses: new Map(), n30: 0, n60: 0, end: bs.end };
    a.campuses.add(bs.campus); a.batches.add(b);
    a.subjects.set(s, (a.subjects.get(s) ?? 0) + Number(plain(r.n60)));
    a.courses.set(`${plain(r.t)} [${s}]`, (a.courses.get(`${plain(r.t)} [${s}]`) ?? 0) + Number(plain(r.n60)));
    a.n30 += Number(plain(r.n30)); a.n60 += Number(plain(r.n60));
    if (bs.end < a.end) a.end = bs.end;
    acc.set(k, a);
  }
  const fmt = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} (${n})`).join("; ");
  const out = [["employee_id", "name", "fcc_mapped_subject", "current_semester", "semester_ends", "campuses", "batches", "subjects_taught (lectures, 60 days)", "main_subject", "mapped_subject_among_taught", "courses_taught (lectures, 60 days)", "lectures_30d", "lectures_60d"].join(",")];
  const tally = new Map<string, number>(), subjTally = new Map<string, number>();
  let mismatch = 0;
  for (const [k, a] of [...acc].sort((x, y) => Number(x[0].split("|")[1]) - Number(y[0].split("|")[1]))) {
    const [u, sem] = k.split("|"); const p = people.get(u)!;
    const mapped = subj(p.deptArea || p.manualDeptArea) ?? "";
    const main = [...a.subjects].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
    const among = mapped ? a.subjects.has(mapped) : false;
    if (!among) mismatch++;
    tally.set(`Sem ${sem}`, (tally.get(`Sem ${sem}`) ?? 0) + 1);
    for (const s of a.subjects.keys()) subjTally.set(`Sem ${sem} | ${s}`, (subjTally.get(`Sem ${sem} | ${s}`) ?? 0) + 1);
    out.push([p.employeeId, p.fullName, mapped, sem, a.end, [...a.campuses].join("; "), [...a.batches].join("; "), fmt(a.subjects), main, among ? "yes" : "no", fmt(a.courses), a.n30, a.n60].map(csv).join(","));
  }
  fs.writeFileSync("current_sem_teaching.csv", out.join("\n"));
  console.log(`Instructor x current-semester rows: ${out.length - 1} (instructors: ${new Set([...acc.keys()].map((k) => k.split("|")[0])).size}); lectures in batches not in the prod sequence: ${unknownBatch}`);
  for (const [k, n] of [...tally].sort()) console.log(`  ${k}: ${n} instructors`);
  console.log("Instructors per semester x subject taught:");
  for (const [k, n] of [...subjTally].sort()) console.log(`  ${k}: ${n}`);
  console.log(`Rows where the FCC mapped subject is NOT among the subjects taught: ${mismatch}`);
  console.log("Wrote current_sem_teaching.csv (HAS NAMES): gzip -kf current_sem_teaching.csv, download the .gz, then rm current_sem_teaching.csv current_sem_teaching.csv.gz");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
