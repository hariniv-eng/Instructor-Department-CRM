// One-off, READ-ONLY (2026-10-27): every session one instructor has taken, one line per session, oldest first: date, start time,
// status, session type, batch, portal course, session title, and the unit(s)/resource(s) used in it (with the lecture-list name when
// the unit is a known lecture). Source: niat_scheduled_session_wise_resource_details. Writes nothing. Output has staff details: clear
// the shell after copying. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_person_session_list.ts NW2000396
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const employeeId = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  if (!employeeId) { console.log("Give an employee id, e.g. NW2000396"); process.exit(1); }
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, employeeId));
  if (!p?.teachosUserId) { console.log(`${employeeId}: not found in the CRM or no TeachOS user id`); process.exit(0); }
  const lectureName = new Map<string, string>();
  for (const c of LECTURE_COURSES) for (const l of c.lectures) for (const u of l.unitIds) lectureName.set(u, `${c.title} #${l.n}: ${l.name}`);

  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const t = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.niat_scheduled_session_wise_resource_details\``;
  const q = (batch: boolean) => bq.query({
    query: `SELECT session_id, CAST(MIN(session_start_datetime) AS STRING) AS start,
              STRING_AGG(DISTINCT CAST(session_status AS STRING), '/') AS status, ANY_VALUE(session_type) AS type,
              ${batch ? "ANY_VALUE(CAST(batch_name AS STRING))" : "NULL"} AS batch, ANY_VALUE(learning_portal_course_title) AS course,
              ANY_VALUE(session_title) AS title,
              ARRAY_AGG(DISTINCT STRUCT(REPLACE(LOWER(IFNULL(resource_id, '')), '-', '') AS id, IFNULL(resource_title, '') AS rt)) AS res
            FROM ${t}
            WHERE instructor_user_id = @id AND session_start_datetime <= CURRENT_DATETIME()
            GROUP BY session_id ORDER BY start`,
    params: { id: p.teachosUserId },
  });
  const [rows] = await q(true).catch(() => q(false)); // batch_name may not exist in this table
  console.log(`${employeeId} · ${rows.length} sessions\n`);
  console.log("# | date time | status | type | batch | portal course | session title | unit(s) used");
  (rows as Record<string, unknown>[]).forEach((r, i) => {
    const res = ((r.res as { id: string; rt: string }[]) ?? []).filter((x) => x.id || x.rt)
      .map((x) => lectureName.get(x.id) ?? x.rt ?? x.id).join(" ; ");
    console.log(`${i + 1} | ${plain(r.start).slice(0, 16)} | ${plain(r.status)} | ${plain(r.type)} | ${plain(r.batch) || "-"} | ${plain(r.course) || "-"} | ${plain(r.title) || "-"} | ${res || "-"}`);
  });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
