// One-off, READ-ONLY (2026-10-27): which lectures of ONE course (from the lecture list, lectureSessions.ts) one instructor has taught.
// Matches each session by unit ID (any of the lecture's IDs) and, as a check, by session title = lecture name (for a version of the
// course whose unit IDs are not in the list yet). Prints every matching session, then lectures covered (completed) n / total and the
// lectures not covered. Writes nothing. Run in the Replit shell from artifacts/api-server (course = part of the title, default Modern Responsive):
//   pnpm exec tsx src/lib/connectors/_tmp_person_course_topics.ts NW0004813
//   pnpm exec tsx src/lib/connectors/_tmp_person_course_topics.ts NW0004813 "Static Web"
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const nameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const employeeId = (args[0] ?? "").trim().toUpperCase();
  const want = (args[1] ?? "Modern Responsive").toLowerCase();
  const course = LECTURE_COURSES.find((c) => c.title.toLowerCase().includes(want) || c.key.toLowerCase().includes(want));
  if (!employeeId || !course) { console.log(`Usage: <employee id> ["course"]. Courses: ${LECTURE_COURSES.map((c) => c.title).join(", ")}`); process.exit(1); }
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, employeeId));
  if (!p?.teachosUserId) { console.log(`${employeeId}: not found in the CRM or no TeachOS user id`); process.exit(0); }

  const byUnit = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const l of course.lectures) { for (const u of l.unitIds) byUnit.set(u, l.n); byName.set(nameKey(l.name), l.n); }
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const t = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.niat_scheduled_session_wise_resource_details\``;
  const [rows] = await bq.query({
    query: `SELECT session_id, CAST(MIN(session_start_datetime) AS STRING) AS start, STRING_AGG(DISTINCT CAST(session_status AS STRING), '/') AS status,
              ANY_VALUE(session_type) AS type, ANY_VALUE(learning_portal_course_title) AS course, ANY_VALUE(session_title) AS title,
              STRING_AGG(DISTINCT REPLACE(LOWER(IFNULL(resource_id, '')), '-', ''), ',') AS units
            FROM ${t} WHERE instructor_user_id = @id AND session_start_datetime <= CURRENT_DATETIME()
            GROUP BY session_id ORDER BY start`,
    params: { id: p.teachosUserId },
  });
  const all = rows as Record<string, unknown>[];
  console.log(`${employeeId} · Subject: ${p.deptArea || p.manualDeptArea || "-"} · ${all.length} sessions in all · checking "${course.title}" (${course.lectures.length} lectures)\n`);
  console.log("date time | status | type | portal course | session title | lecture # (how matched)");
  const covered = new Set<number>();
  let hits = 0;
  for (const r of all) {
    const units = plain(r.units).split(",");
    const nId = units.map((u) => byUnit.get(u)).find((n) => n !== undefined);
    const nNm = byName.get(nameKey(plain(r.title).replace(/\s*mcq practice\s*$/i, "")));
    const n = nId ?? nNm;
    if (n === undefined) continue;
    hits++;
    const how = nId !== undefined ? "unit ID" : "title only";
    if (String(r.type).toUpperCase() === "LECTURE" && plain(r.status).includes("COMPLETED")) covered.add(n);
    console.log(`${plain(r.start).slice(0, 16)} | ${plain(r.status)} | ${plain(r.type)} | ${plain(r.course) || "-"} | ${plain(r.title) || "-"} | #${n} (${how})`);
  }
  if (!hits) console.log("  (none)");
  console.log(`\nLectures of "${course.title}" taught (completed lecture sessions): ${covered.size} / ${course.lectures.length}`);
  for (const l of course.lectures) console.log(`  ${covered.has(l.n) ? "[x]" : "[ ]"} #${l.n} ${l.name}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
