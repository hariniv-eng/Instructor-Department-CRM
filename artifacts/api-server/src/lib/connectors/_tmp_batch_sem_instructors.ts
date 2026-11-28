// One-off, READ-ONLY (2026-11-28, per request: "in the KKH prod sequence data for Semester 6, give me the list of unique instructors who have
// taken the sessions"). From niat_schedule_details_as_per_prod_sequence (FCC's own BigQuery dataset): every distinct instructor on the
// sessions of one semester in the matching batches, with their FCC employee ID (matched by TeachOS user id), FCC subject / product, and per
// course the sessions they have (completed / all, by type). Names are printed here only -- nothing is written to a file.
//   pnpm exec tsx src/lib/connectors/_tmp_batch_sem_instructors.ts [batch text, default "KKH"] [semester number, default 6]
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { normUid } from "./topinAssessments";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const batch = args.find((a) => !/^\d$/.test(a)) ?? "KKH";
  const sem = `Semester ${args.find((a) => /^\d$/.test(a)) ?? "6"}`;
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `SELECT REPLACE(LOWER(instructor_user_id), '-', '') AS u, ANY_VALUE(instructor_name) AS nm, ANY_VALUE(instructor_category) AS cat,
      course_title AS t, COUNTIF(session_status = 'COMPLETED') AS done, COUNT(*) AS n,
      COUNTIF(session_type = 'LECTURE') AS lec, COUNTIF(session_type IN ('PRACTICE', 'PRECTICE')) AS pr, COUNTIF(session_type = 'EXAM') AS ex,
      CAST(MIN(DATE(session_start_datetime)) AS STRING) AS first, CAST(MAX(DATE(session_start_datetime)) AS STRING) AS last
    FROM \`${P}.${DS}.niat_schedule_details_as_per_prod_sequence\`
    WHERE semester_title = @sem AND LOWER(batch_name) LIKE LOWER(@b)
    GROUP BY 1, 4 ORDER BY 1, 5 DESC`, params: { sem, b: `%${batch}%` } });
  const people = new Map((await db.select().from(instructorsTable)).filter((p) => p.teachosUserId).map((p) => [normUid(p.teachosUserId!), p]));
  type I = { name: string; cat: string; courses: string[]; done: number; n: number };
  const by = new Map<string, I>();
  let noInstructor = 0;
  for (const r of rows as Record<string, unknown>[]) {
    const u = plain(r.u);
    if (!u) { noInstructor += Number(plain(r.n)); continue; }
    const x = by.get(u) ?? { name: plain(r.nm), cat: plain(r.cat), courses: [], done: 0, n: 0 };
    x.done += Number(plain(r.done)); x.n += Number(plain(r.n));
    x.courses.push(`${plain(r.t)}: ${plain(r.done)}/${plain(r.n)} completed (lecture ${plain(r.lec)}, practice ${plain(r.pr)}, exam ${plain(r.ex)}; ${plain(r.first)} -> ${plain(r.last)})`);
    by.set(u, x);
  }
  console.log(`${sem}, batches matching "${batch}": ${by.size} distinct instructors (sessions with no instructor: ${noInstructor})\n`);
  let i = 0;
  for (const [u, x] of [...by].sort((a, b) => b[1].done - a[1].done)) {
    const p = people.get(u);
    i++;
    console.log(`${i}. ${p?.employeeId ?? "(not in FCC)"} | ${x.name} | TeachOS category ${x.cat || "-"} | FCC: ${p ? `${normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) ?? "no subject"}, ${productOf(p)}, ${p.classification ?? "-"}` : "-"} | sessions ${x.done}/${x.n} completed`);
    for (const c of x.courses) console.log(`     ${c}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
