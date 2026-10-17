// One-off, READ-ONLY (2026-10-17): every session of one instructor in one course over the last N days, with EVERY column the
// session view has (session title / name, topic, type, status, dates, batch...), so we can see what the sessions actually were.
// Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_course_sessions.ts NW0007870 d8360c969d994614b1da8f3a26ee57df
//   pnpm exec tsx src/lib/connectors/_tmp_course_sessions.ts NW0007870 d8360c969d994614b1da8f3a26ee57df 60   (last 60 days)
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { getSchema } from "./instructorLearningStatus";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const employeeId = (args[0] ?? "").trim().toUpperCase();
  const courseId = (args[1] ?? "").toLowerCase().replace(/[^0-9a-f]/g, ""); // keep only the hex id: a stray "~" or space pasted with it matched nothing
  const days = Math.max(1, Number(args[2]) || 30);
  if (!employeeId || !courseId) { console.log("Usage: _tmp_course_sessions.ts <EMPLOYEE_ID> <COURSE_ID> [days]"); process.exit(1); }
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, employeeId));
  if (!p?.teachosUserId) { console.log(`${employeeId}: not found or no TeachOS user id`); process.exit(0); }
  const cols = (await getSchema(SESSION_SCHEDULE_TABLE)).map(([n]) => n);
  console.log(`Columns in ${SESSION_SCHEDULE_TABLE}:\n  ${cols.join(", ")}\n`);
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c));
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const [rows] = await bq.query({
    query: `
      SELECT * FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\`
      WHERE instructor_user_id = @id AND REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '') = @course
        AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL ${days} DAY)
      ORDER BY session_start_datetime`,
    params: { id: p.teachosUserId, course: courseId },
  });
  console.log(`${p.fullName} (${employeeId}) · course ${courseId} · last ${days} days: ${rows.length} session(s)\n`);
  const show = (v: unknown) => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v === null || v === undefined ? "" : String(v));
  (rows as Record<string, unknown>[]).forEach((r, i) => {
    console.log(`--- Session ${i + 1} ---`);
    for (const c of cols) { const v = show(r[c]); if (v !== "") console.log(`  ${c}: ${v.length > 200 ? v.slice(0, 200) + "…" : v}`); }
  });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
