// One-off, READ-ONLY (2026-10-27, per request: IPS by course ID). Looks a course up by its course ID in BOTH the session schedule table
// (learning_portal_course_id / semester_course_id) and the resource table (learning_portal_course_id), and lists what was scheduled:
// per session title -- type, status, instructors, first / last date -- and, from the resource table, the main unit used, marked when it
// is one of the IPS lecture-list unit IDs. Also lists courses whose title looks like IPS / Sem 4 / Phase 4 / Advanced DSA, with IDs.
// No staff names. Writes nothing. Default course ID = Training Stats "IPS" (NIAT - DSA Sem 4 Course).
//   pnpm exec tsx src/lib/connectors/_tmp_course_id_sessions.ts
//   pnpm exec tsx src/lib/connectors/_tmp_course_id_sessions.ts <course id>
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { SESSION_SCHEDULE_TABLE } from "./instructorContribution";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const N = (c: string) => `REPLACE(LOWER(CAST(${c} AS STRING)), '-', '')`;
async function main() {
  const cid = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "c51b2ebf-d646-4680-b868-e731110ef183").toLowerCase().replace(/-/g, "");
  const ips = LECTURE_COURSES.find((c) => c.key === "lecture_ips");
  const ipsUnit = new Map<string, string>(); ips?.lectures.forEach((l) => l.unitIds.forEach((u) => ipsUnit.set(u, `IPS #${l.n}`)));
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const S = `\`${ds}.${SESSION_SCHEDULE_TABLE}\``, R = `\`${ds}.niat_scheduled_session_wise_resource_details\``;

  const [look] = await bq.query({ query: `
    SELECT learning_portal_course_id AS id, ANY_VALUE(learning_portal_course_title) AS title, 'portal' AS kind, COUNT(DISTINCT instructor_user_id) AS ins,
           CAST(MIN(DATE(session_start_datetime)) AS STRING) AS f, CAST(MAX(DATE(session_start_datetime)) AS STRING) AS l FROM ${S}
    WHERE REGEXP_CONTAINS(LOWER(IFNULL(learning_portal_course_title, '')), r'ips|sem 4|sem4|phase 4|phase 2|advanced dsa|greedy|dynamic|graph|algorithm design|patterns')
    GROUP BY 1 UNION ALL
    SELECT semester_course_id, ANY_VALUE(semester_course_title), 'semester', COUNT(DISTINCT instructor_user_id),
           CAST(MIN(DATE(session_start_datetime)) AS STRING), CAST(MAX(DATE(session_start_datetime)) AS STRING) FROM ${S}
    WHERE REGEXP_CONTAINS(LOWER(IFNULL(semester_course_title, '')), r'ips|sem 4|sem4|phase 4|advanced dsa|greedy|dynamic|graph|algorithm design|problem solving')
    GROUP BY 1 ORDER BY 4 DESC` });
  console.log("Courses in the schedule that look related (kind | course id | title | instructors | first..last):");
  for (const r of look as Record<string, unknown>[]) console.log(`  ${plain(r.kind)} | ${plain(r.id)} | ${plain(r.title)} | ${plain(r.ins)} | ${plain(r.f)}..${plain(r.l)}`);

  const [sch] = await bq.query({ query: `
    SELECT session_title AS t, UPPER(session_type) AS st, session_status AS ss, institute_type AS it, COUNT(DISTINCT instructor_user_id) AS ins,
           CAST(MIN(DATE(session_start_datetime)) AS STRING) AS f, CAST(MAX(DATE(session_start_datetime)) AS STRING) AS l,
           ANY_VALUE(learning_portal_course_title) AS pt, ANY_VALUE(semester_course_title) AS sct
    FROM ${S} WHERE ${N("learning_portal_course_id")} = @cid OR ${N("semester_course_id")} = @cid
    GROUP BY 1, 2, 3, 4 ORDER BY f, t`, params: { cid } });
  const sr = sch as Record<string, unknown>[];
  console.log(`\nSession schedule rows for course ${cid}: ${sr.length ? `portal "${plain(sr[0].pt)}" / semester "${plain(sr[0].sct)}"` : "NONE"}`);
  for (const r of sr) console.log(`  ${plain(r.f)}..${plain(r.l)} | ${plain(r.st)} | ${plain(r.ss)} | ${plain(r.it)} | ${plain(r.ins)} instr | ${plain(r.t)}`);

  const [res] = await bq.query({ query: `
    SELECT session_title AS t, REPLACE(LOWER(resource_id), '-', '') AS u, ANY_VALUE(resource_title) AS rt, COUNT(DISTINCT instructor_user_id) AS ins
    FROM ${R} WHERE ${N("learning_portal_course_id")} = @cid AND UPPER(session_type) = 'LECTURE'
      AND NOT REGEXP_CONTAINS(LOWER(IFNULL(resource_title, '')), r'quiz|mcq|coding|tutorial|practice|ppt|reading|cheat')
    GROUP BY 1, 2 ORDER BY 1`, params: { cid } }).catch((e) => { console.log(`(resource table: ${(e as Error).message})`); return [[]]; });
  const rr = res as Record<string, unknown>[];
  console.log(`\nResource table, lecture units for course ${cid} (session title | unit | unit title | instructors | in IPS list?): ${rr.length ? "" : "NONE"}`);
  for (const r of rr) console.log(`  ${plain(r.t)} | ${plain(r.u)} | ${plain(r.rt)} | ${plain(r.ins)} | ${ipsUnit.get(plain(r.u)) ?? "-"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
