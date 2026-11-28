// One-off, READ-ONLY (2026-11-28, per request: "Sai Mamidisetti NW0004011 shows Maths on Deployed - Readiness but he is a tech instructor --
// why?"). For one employee: every completed LECTURE session in the last 60 days from the session schedule table (the data Deployed -
// Readiness uses), grouped by course id / title / batch, with the subject each course maps to (taughtSubjectColumn, the same rule) and
// WHY (teaching-course list by id, Training Stats course id, or title), plus the batch's current semester from the prod sequence.
// Also their FCC mapped subject. No other people.   pnpm exec tsx src/lib/connectors/_tmp_person_lecture_subjects.ts NW0004011
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { taughtSubjectColumn } from "./taughtTraining";
import { TEACHING_COURSE_SUBJECTS } from "../../data/teachingCourseSubjects";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "NW0004011").trim().toUpperCase();
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  if (!p?.teachosUserId) { console.log(`${emp}: not in FCC or no TeachOS id`); process.exit(0); }
  console.log(`${emp} | ${p.fullName} | FCC mapped subject: ${normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) ?? "(none)"} (Darwin area: ${p.deptArea ?? "-"}, manual: ${p.manualDeptArea ?? "-"})`);
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [colRows] = await bq.query({ query: `SELECT column_name FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t`, params: { t: SESSION_SCHEDULE_TABLE } });
  const cols = (colRows as Record<string, unknown>[]).map((r) => plain(r.column_name));
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c));
  const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c));
  const batchCol = cols.find((c) => /^batch_name$/i.test(c)) ?? cols.find((c) => /batch.*name/i.test(c));
  console.log(`(course id column: ${idCol}, title column: ${titleCol}, batch column: ${batchCol})`);
  const [rows] = await bq.query({ query: `SELECT REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '') AS cid, CAST(${titleCol} AS STRING) AS t, CAST(${batchCol} AS STRING) AS b,
      COUNTIF(session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY)) AS n30, COUNT(*) AS n60,
      ARRAY_AGG(DISTINCT session_title IGNORE NULLS LIMIT 5) AS titles
    FROM \`${P}.${DS}.${SESSION_SCHEDULE_TABLE}\`
    WHERE REPLACE(LOWER(instructor_user_id), '-', '') = @u AND session_status = 'COMPLETED' AND session_type = 'LECTURE'
      AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 60 DAY) AND session_start_datetime <= CURRENT_DATETIME()
    GROUP BY 1, 2, 3 ORDER BY n60 DESC`, params: { u: p.teachosUserId.replace(/-/g, "").toLowerCase() } });
  const [sems] = await bq.query({ query: `SELECT batch_name AS b, semester_title AS s, MAX(SAFE_CAST(CAST(is_current_semester AS STRING) AS INT64)) AS cur,
      CAST(MIN(semester_start_date) AS STRING) AS st, CAST(MAX(semester_end_date) AS STRING) AS en
    FROM \`${P}.${DS}.niat_schedule_details_as_per_prod_sequence\` WHERE batch_name IN UNNEST(@b) GROUP BY 1, 2 ORDER BY 1, 2`,
    params: { b: [...new Set((rows as Record<string, unknown>[]).map((r) => plain(r.b)))].length ? [...new Set((rows as Record<string, unknown>[]).map((r) => plain(r.b)))] : ["-"] } });
  console.log(`\nCompleted LECTURE sessions, last 60 days (${(rows as unknown[]).length} course x batch groups):`);
  for (const r of rows as Record<string, unknown>[]) {
    const cid = plain(r.cid), t = plain(r.t);
    const why = cid in TEACHING_COURSE_SUBJECTS ? `teaching-course list by id -> ${TEACHING_COURSE_SUBJECTS[cid] ?? "General"}`
      : TRAINING_COURSE_TAXONOMY.find((d) => (d.courseIds ?? []).some((x) => x.replace(/-/g, "").toLowerCase() === cid)) ? `Training Stats course id (${TRAINING_COURSE_TAXONOMY.find((d) => (d.courseIds ?? []).some((x) => x.replace(/-/g, "").toLowerCase() === cid))!.key})`
      : "by title / words";
    console.log(`  ${t} | course id ${cid} | batch ${plain(r.b)} | last 30 days ${plain(r.n30)}, last 60 days ${plain(r.n60)} | subject ${taughtSubjectColumn(cid, t) ?? "(left out: orientation / general)"} via ${why}`);
    console.log(`      sessions e.g.: ${((r.titles as unknown[]) ?? []).map(plain).join(" | ")}`);
  }
  console.log("\nTheir batches' semesters in the prod sequence:");
  for (const r of sems as Record<string, unknown>[]) console.log(`  ${plain(r.b)} | ${plain(r.s)} | current flag ${plain(r.cur)} | ${plain(r.st)} -> ${plain(r.en)}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
