// One-off, READ-ONLY (2026-10-27): ALL-TIME session totals for one instructor, from the session schedule table. Prints the first/last
// session date, totals by status x session type, the grand total of COMPLETED sessions, and COMPLETED sessions per course. Writes nothing.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_person_session_totals.ts NW2000396
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const employeeId = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  if (!employeeId) { console.log("Give an employee id, e.g. NW2000396"); process.exit(1); }
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, employeeId));
  if (!p?.teachosUserId) { console.log(`${employeeId}: not found in the CRM or no TeachOS user id`); process.exit(0); }
  console.log(`${employeeId} · TeachOS ${p.teachosUserId} · Subject: ${p.deptArea || p.manualDeptArea || "-"}`);

  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const t = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\``;
  const params = { id: p.teachosUserId };

  const [span] = await bq.query({ query: `SELECT CAST(MIN(DATE(session_start_datetime)) AS STRING) AS f, CAST(MAX(DATE(session_start_datetime)) AS STRING) AS l,
      COUNT(DISTINCT session_id) AS n FROM ${t} WHERE instructor_user_id = @id AND session_start_datetime <= CURRENT_DATETIME()`, params });
  const s = (span as Record<string, unknown>[])[0] ?? {};
  console.log(`All sessions up to now: ${plain(s.n)} (first ${plain(s.f) || "-"}, last ${plain(s.l) || "-"})\n`);

  const [rows] = await bq.query({ query: `SELECT session_status, session_type, COUNT(DISTINCT session_id) AS n FROM ${t}
      WHERE instructor_user_id = @id AND session_start_datetime <= CURRENT_DATETIME() GROUP BY 1, 2 ORDER BY 1, 3 DESC`, params });
  console.log("By status | session type | sessions:");
  let completed = 0;
  for (const r of rows as Record<string, unknown>[]) {
    console.log(`  ${plain(r.session_status)} | ${plain(r.session_type)} | ${plain(r.n)}`);
    if (plain(r.session_status) === "COMPLETED") completed += Number(plain(r.n));
  }
  console.log(`\nTOTAL COMPLETED sessions (all types): ${completed}\n`);

  const [byCourse] = await bq.query({ query: `SELECT CAST(course_title AS STRING) AS course, session_type, COUNT(DISTINCT session_id) AS n FROM ${t}
      WHERE instructor_user_id = @id AND session_status = 'COMPLETED' AND session_start_datetime <= CURRENT_DATETIME()
      GROUP BY 1, 2 ORDER BY 3 DESC`, params }).catch(() => [[]]);
  if ((byCourse as unknown[]).length) {
    console.log("COMPLETED sessions by course | session type | sessions:");
    for (const r of byCourse as Record<string, unknown>[]) console.log(`  ${plain(r.course) || "(no title)"} | ${plain(r.session_type)} | ${plain(r.n)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
