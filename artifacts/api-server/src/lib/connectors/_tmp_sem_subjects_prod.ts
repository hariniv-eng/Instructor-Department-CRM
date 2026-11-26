// One-off, READ-ONLY (2026-11-26, per request: "can you map the subject for sem-6 instructors"). From niat_schedule_details_as_per_prod_sequence
// (FCC's own BigQuery dataset): for the semester(s) given (default 6 and 5), every course in that semester with the FCC subject it maps to
// (same course -> subject rule as Taught in Class, taughtSubjectColumn), the batches, sessions scheduled / completed, and the instructors on it
// (employee ID + name, matched by TeachOS user id -- printed here only, never stored). Also prints the table's 36 columns first, and which
// columns were used, so the full course / lecture-order mapping can be built next.
//   pnpm exec tsx src/lib/connectors/_tmp_sem_subjects_prod.ts [6 5]
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { taughtSubjectColumn } from "./taughtTraining";
import { normUid } from "./topinAssessments";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const TABLE = "niat_schedule_details_as_per_prod_sequence";

async function main() {
  const sems = process.argv.slice(2).filter((a) => /^\d$/.test(a));
  const want = (sems.length ? sems : ["6", "5"]).map((s) => `Semester ${s}`);
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.${DS}.${TABLE}\``;
  const [colRows] = await bq.query({ query: `SELECT column_name, data_type FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`, params: { t: TABLE } });
  const cols = (colRows as Record<string, unknown>[]).map((r) => [plain(r.column_name), plain(r.data_type)] as [string, string]);
  console.log(`Columns (${cols.length}): ${cols.map(([c, t]) => `${c}:${t}`).join(", ")}`);
  const find = (...res: RegExp[]) => { for (const re of res) { const c = cols.find(([n]) => re.test(n)); if (c) return c[0]; } return undefined; };
  const cid = find(/^course_id$/i, /course.*id/i), ctitle = find(/^course_title$/i, /course.*(title|name)/i);
  const uid = find(/^instructor_user_id$/i, /instructor.*user.*id/i, /instructor.*id/i);
  const status = find(/^session_status$/i, /status/i), start = find(/session_start/i, /start_datetime/i, /session_date/i);
  console.log(`Using: course id = ${cid ?? "-"}, course title = ${ctitle ?? "-"}, instructor = ${uid ?? "-"}, status = ${status ?? "-"}, session start = ${start ?? "-"}`);
  if (!ctitle && !cid) { console.log("No course column found -- send this output so the mapping can be written by hand."); process.exit(0); }

  const people = new Map((await db.select().from(instructorsTable)).filter((p) => p.teachosUserId).map((p) => [normUid(p.teachosUserId!), p]));
  const [rows] = await bq.query({ query: `SELECT semester_title AS s, ${cid ? `CAST(${cid} AS STRING)` : "''"} AS cid, ${ctitle ? `CAST(${ctitle} AS STRING)` : "''"} AS t,
      batch_name AS b, ${uid ? `REPLACE(LOWER(CAST(${uid} AS STRING)), '-', '')` : "''"} AS u,
      COUNT(*) AS n, ${status ? `COUNTIF(UPPER(CAST(${status} AS STRING)) = 'COMPLETED')` : "0"} AS done,
      ${start ? `CAST(MIN(${start}) AS STRING)` : "''"} AS first, ${start ? `CAST(MAX(${start}) AS STRING)` : "''"} AS last
    FROM ${T} WHERE semester_title IN UNNEST(@want) GROUP BY 1, 2, 3, 4, 5`, params: { want } });
  type C = { subject: string; n: number; done: number; batches: Set<string>; who: Map<string, number>; first: string; last: string };
  const by = new Map<string, Map<string, C>>();
  for (const r of rows as Record<string, unknown>[]) {
    const s = plain(r.s), t = plain(r.t) || plain(r.cid);
    const sem = by.get(s) ?? new Map<string, C>(); by.set(s, sem);
    const c = sem.get(t) ?? { subject: taughtSubjectColumn(plain(r.cid), plain(r.t)) ?? "(not mapped)", n: 0, done: 0, batches: new Set<string>(), who: new Map<string, number>(), first: "", last: "" };
    c.n += Number(plain(r.n)); c.done += Number(plain(r.done)); c.batches.add(plain(r.b));
    const f = plain(r.first).slice(0, 10), l = plain(r.last).slice(0, 10);
    if (f && (!c.first || f < c.first)) c.first = f; if (l > c.last) c.last = l;
    const p = people.get(plain(r.u));
    const k = p ? `${p.employeeId ?? "?"} ${p.fullName}` : plain(r.u) ? `(not in FCC: ${plain(r.u).slice(0, 8)})` : "(no instructor)";
    c.who.set(k, (c.who.get(k) ?? 0) + Number(plain(r.n)));
    sem.set(t, c);
  }
  for (const s of want) {
    const sem = by.get(s);
    console.log(`\n===== ${s}: ${sem ? sem.size : 0} courses`);
    if (!sem) continue;
    const bySubject = new Map<string, number>();
    for (const [t, c] of [...sem].sort((a, b) => a[1].subject.localeCompare(b[1].subject) || b[1].n - a[1].n)) {
      bySubject.set(c.subject, (bySubject.get(c.subject) ?? 0) + 1);
      console.log(`\n  [${c.subject}] ${t}  -- sessions ${c.n} (completed ${c.done}), ${c.first} -> ${c.last}, batches: ${[...c.batches].join("; ")}`);
      for (const [w, n] of [...c.who].sort((a, b) => b[1] - a[1])) console.log(`      ${w}: ${n}`);
    }
    console.log(`\n  ${s} subjects: ${[...bySubject].map(([k, v]) => `${k} (${v} course${v === 1 ? "" : "s"})`).join(", ")}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
