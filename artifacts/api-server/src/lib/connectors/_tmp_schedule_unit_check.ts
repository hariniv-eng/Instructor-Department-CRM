// One-off, READ-ONLY (2026-10-27, per request: "check the unit IDs not in the learning-portal data but in the sessions scheduled for the
// instructors"). For ONE course of the lecture list, searches the instructor SESSION SCHEDULE table (niat_instructor_session_schedule_
// details, SESSION_SCHEDULE_TABLE) instead of the resource table:
//   1) prints the table's columns, and which ID-type / title-type columns contain the course's unit IDs or lecture names;
//   2) per lecture: scheduled sessions found (by unit ID, else by title) with status, session type, institute type, instructors and
//      first / last date -- so upcoming (PENDING) IPS sessions show too.
// No staff names. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_schedule_unit_check.ts IPS
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const nameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const ID = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;
const NM = (c: string) => `REGEXP_REPLACE(REPLACE(LOWER(CAST(${c} AS STRING)), '&', 'and'), r'[^a-z0-9]', '')`;

async function main() {
  const want = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "IPS").toLowerCase();
  const course = LECTURE_COURSES.find((c) => c.title.toLowerCase() === want) ?? LECTURE_COURSES.find((c) => c.title.toLowerCase().includes(want));
  if (!course) { console.log(`No course "${want}"`); process.exit(1); }
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const t = `\`${ds}.${SESSION_SCHEDULE_TABLE}\``;
  const [colRows] = await bq.query({ query: `SELECT column_name, data_type FROM \`${ds}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`, params: { t: SESSION_SCHEDULE_TABLE } });
  const cols = (colRows as { column_name: string; data_type: string }[]);
  console.log(`${SESSION_SCHEDULE_TABLE} columns:\n  ${cols.map((c) => `${c.column_name} (${c.data_type})`).join(", ")}\n`);
  const strCols = cols.filter((c) => c.data_type === "STRING").map((c) => c.column_name);
  const idCols = strCols.filter((c) => /id$|_id|unit|resource|topic|lesson|content/i.test(c) && !/instructor|user|batch|institute|section|session_id$/i.test(c));
  const nameCols = strCols.filter((c) => /title|name|topic|unit|lesson|resource/i.test(c) && !/instructor|user|batch|institute/i.test(c));
  const units = course.lectures.flatMap((l) => l.unitIds);
  const names = course.lectures.map((l) => nameKey(l.name));

  console.log(`"${course.title}": ${course.lectures.length} lectures. Columns that contain its unit IDs / lecture names:`);
  let idCol: string | null = null, nameCol: string | null = null, best = 0, bestN = 0;
  for (const c of idCols) {
    const [r] = await bq.query({ query: `SELECT COUNT(*) AS n FROM ${t} WHERE ${ID(c)} IN UNNEST(@units)`, params: { units } });
    const n = Number(plain((r as Record<string, unknown>[])[0]?.n)); console.log(`  by unit ID   ${c}: ${n} rows`);
    if (n > best) { best = n; idCol = c; }
  }
  for (const c of nameCols) {
    const [r] = await bq.query({ query: `SELECT COUNT(*) AS n FROM ${t} WHERE ${NM(c)} IN UNNEST(@names)`, params: { names } });
    const n = Number(plain((r as Record<string, unknown>[])[0]?.n)); console.log(`  by title     ${c}: ${n} rows`);
    if (n > bestN) { bestN = n; nameCol = c; }
  }
  if (!idCol && !nameCol) { console.log(`\nNothing of "${course.title}" is in the session schedule table (by unit ID or by title).`); process.exit(0); }

  const key = idCol ? ID(idCol) : NM(nameCol!);
  const courseCol = cols.find((c) => /^course_title$|course.*(title|name)/i.test(c.column_name))?.column_name;
  const [rows] = await bq.query({ query: `
    SELECT ${key} AS k, session_status AS ss, UPPER(session_type) AS st, ${cols.some((c) => c.column_name === "institute_type") ? "institute_type" : "''"} AS it,
           ${courseCol ? `ANY_VALUE(CAST(${courseCol} AS STRING))` : "''"} AS course,
           COUNT(DISTINCT instructor_user_id) AS ins, COUNT(*) AS n,
           CAST(MIN(DATE(session_start_datetime)) AS STRING) AS f, CAST(MAX(DATE(session_start_datetime)) AS STRING) AS l
    FROM ${t} WHERE ${key} IN UNNEST(@vals) GROUP BY 1, 2, 3, 4`, params: { vals: idCol ? units : names } });
  console.log(`\nPer lecture (matched ${idCol ? `by unit ID in ${idCol}` : `by title in ${nameCol}`}) -- status / type / institute type: instructors, rows, dates, course:`);
  const R = rows as Record<string, unknown>[];
  let found = 0;
  for (const l of course.lectures) {
    const ks = idCol ? l.unitIds : [nameKey(l.name)];
    const mine = R.filter((r) => ks.includes(plain(r.k)));
    if (mine.length) found++;
    console.log(`#${l.n} ${l.name}: ${mine.length ? mine.map((r) => `${plain(r.ss)}/${plain(r.st)}/${plain(r.it)} ${plain(r.ins)} instr, ${plain(r.n)} rows, ${plain(r.f)}..${plain(r.l)}${plain(r.course) ? `, ${plain(r.course)}` : ""}`).join("; ") : "-"}`);
  }
  console.log(`\nLectures found in the schedule: ${found} / ${course.lectures.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
