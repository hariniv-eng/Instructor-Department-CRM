// One-off, READ-ONLY (2026-10-17): one instructor's completed sessions in the last 30 days, by session type and course, with the subject
// each course maps to under "Subject (from sessions)" -- to see WHY a person shows a given subject. Writes nothing.
// Run in the Replit shell from artifacts/api-server, with an employee id:
//   pnpm exec tsx src/lib/connectors/_tmp_person_sessions.ts NW2000325
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { getSchema } from "./instructorLearningStatus";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { TRAINING_COURSE_TAXONOMY } from "../../data/trainingCourseTaxonomy";

const TRACK_SUBJECT: Record<string, string> = {
  "Frontend Development": "Frontend", "Backend Development": "Backend", DSA: "DSA", "Gen AI": "GenAI",
  DSML: "Artificial Intelligence & Emerging Technologies", Aptitude: "Aptitude", Maths: "Maths", English: "English",
};

async function main() {
  const employeeId = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  if (!employeeId) { console.log("Give an employee id, e.g. NW2000325"); process.exit(1); }
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, employeeId));
  if (!p?.teachosUserId) { console.log(`${employeeId}: not found or no TeachOS user id`); process.exit(0); }
  console.log(`${p.fullName} (${employeeId}) · TeachOS ${p.teachosUserId} · Subject now: ${p.deptArea || p.manualDeptArea || "-"}`);

  const cols = (await getSchema(SESSION_SCHEDULE_TABLE)).map(([n]) => n);
  const idCol = cols.find((c) => /^course_id$/i.test(c)) ?? cols.find((c) => /course.*id/i.test(c)) ?? null;
  const titleCol = cols.find((c) => /^course_title$/i.test(c)) ?? cols.find((c) => /course.*(title|name)/i.test(c)) ?? null;
  const extra = cols.filter((c) => /topic|unit|module|subject|batch_name/i.test(c) && c !== idCol && c !== titleCol).slice(0, 3);
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const query = `
    SELECT session_type,
      ${idCol ? `REPLACE(LOWER(CAST(${idCol} AS STRING)), '-', '')` : "NULL"} AS course_id,
      ${titleCol ? `CAST(${titleCol} AS STRING)` : "NULL"} AS course_title,
      ${extra.map((c) => `ANY_VALUE(CAST(${c} AS STRING)) AS ${c}`).join(", ")}${extra.length ? "," : ""}
      COUNT(*) AS sessions
    FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${SESSION_SCHEDULE_TABLE}\`
    WHERE session_status = 'COMPLETED' AND instructor_user_id = @id
      AND session_start_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 30 DAY)
    GROUP BY 1, 2, 3
    ORDER BY sessions DESC`;
  const [rows] = await bq.query({ query, params: { id: p.teachosUserId } });

  const byId = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const def of TRAINING_COURSE_TAXONOMY) {
    const subject = TRACK_SUBJECT[def.trackGroup];
    for (const cid of def.courseIds ?? []) byId.set(cid.replace(/-/g, "").toLowerCase(), `${subject} (by id: ${def.label})`);
    for (const t of def.courseTitles) byTitle.set(t.trim().toLowerCase(), `${subject} (by title: ${def.label})`);
  }
  console.log(`\nLast 30 days, completed sessions (session type | course | maps to | sessions${extra.length ? ` | ${extra.join(" | ")}` : ""}):`);
  for (const r of rows as Record<string, unknown>[]) {
    const cid = r.course_id ? String(r.course_id) : "";
    const title = r.course_title ? String(r.course_title) : "";
    const subject = (cid && byId.get(cid)) || (title && byTitle.get(title.trim().toLowerCase())) || "no subject match";
    const counted = ["LECTURE", "PRACTICE"].includes(String(r.session_type)) ? "" : "  [not counted: not Lecture/Practice]";
    console.log(`  ${r.session_type} | ${title || "(no title)"} [${cid || "-"}] | ${subject} | ${r.sessions}${extra.map((c) => ` | ${r[c] ?? "-"}`).join("")}${counted}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
