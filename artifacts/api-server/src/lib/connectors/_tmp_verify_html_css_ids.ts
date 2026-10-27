// One-off, READ-ONLY (2026-10-27): checks the unit IDs of the new "HTML & CSS" lecture list (shared 2026-10-27; lectures 1-20 are new,
// 21-41 are the same IDs as Modern Responsive UI) against BigQuery. Prints, per lecture: lecture sessions (all NIAT instructors) that
// used its unit ID, and how many of the given employee's lecture sessions used it. Then lists that employee's lecture sessions whose
// main unit is NOT in the list, and the unit IDs actually used for "Introduction to HTML5" (its ID in the sheet looks like a copy
// error). No staff names printed. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_verify_html_css_ids.ts NW2000396
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";

const LIST: [string, string][] = [
  ["Introduction to GenAI in Web Development", "13893e77-5627-4b22-be3c-9142c0ba14e9"],
  ["Getting Started with Web Development", "34890e58-e10c-4d1e-a573-d11bf08dbde4"],
  ["Introduction to HTML", "a7c0731f-d990-4f17-9d33-566b287d6bdc"],
  ["Leveraging GenAI for Accelerated Learning", "dc1d2276-f338-45f7-ac43-83ad3c21b569"],
  ["Introduction to CSS | Part 1", "33e9b5c1-9c07-4edd-b3c9-7d73dab6ecc6"],
  ["Introduction to CSS | Part 2", "4f237b09-abda-4cfa-999f-b8e7a2e32c69"],
  ["Introduction to CSS | Part 3", "a924ec95-8ac5-4c0d-99c6-04dffbe1e144"],
  ["Introduction to CSS Box Model | Part 1", "98b48a94-8ed4-4514-8212-33f2ec729686"],
  ["Introduction to CSS Box Model | Part 2", "6d4ed7bd-8209-4de1-aab0-2eedde8a4f9a"],
  ["Coding Platform Walkthrough", "6548dace-7d3c-4ce8-96f7-55f943209fb3"],
  ["HTML Void Elements & Lists", "7c8bcead-de06-433f-8ac1-533d77720bbb"],
  ["Website: Behind the Scenes", "0c25218f-6846-4d35-a518-510f3ea70ac7"],
  ["HTML Hyperlinks", "32921038-03e7-4e16-9e5e-e6f9a22f401f"],
  ["Introduction to HTML5 (sheet ID = Hyperlinks Coding Practice?)", "9065d055-57fb-40df-8829-51950964c8f3"],
  ["HTML Semantic Elements", "e452f0d7-79b9-4565-a36d-c8c2f4470c7d"],
  ["Leveraging GenAI for Debugging & Building", "5da67890-23c4-40ec-90b5-cfcf5e3805a3"],
  ["More CSS Concepts", "c8b3711f-893f-47d0-b5f3-42ce93944e73"],
  ["CSS Selectors & Inheritance", "3ffe2e51-042b-4ead-8ca5-fb71b9e4d3bb"],
  ["More CSS Selectors", "e464a0c4-abe7-4d31-b02c-c97556c48682"],
  ["CSS Specificity & Cascade", "e5dd3381-02b7-4209-aca4-ce280b85f042"],
  ["Sizing Elements and Handling Overflow (= Modern Responsive #1)", "4490aacc-70cc-45e5-a020-42fc8b437dfa"],
];
const norm = (s: string) => s.toLowerCase().replace(/-/g, "");
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const employeeId = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "NW2000396").trim().toUpperCase();
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, employeeId));
  const uid = p?.teachosUserId ?? "";
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const t = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.niat_scheduled_session_wise_resource_details\``;
  const ids = LIST.map(([, id]) => norm(id));

  const [rows] = await bq.query({
    query: `SELECT REPLACE(LOWER(resource_id), '-', '') AS id, COUNT(DISTINCT session_id) AS all_s,
              COUNT(DISTINCT IF(instructor_user_id = @uid, session_id, NULL)) AS hers,
              ANY_VALUE(resource_title) AS rt, ANY_VALUE(learning_portal_course_title) AS course
            FROM ${t} WHERE institute_type = 'NIAT_OFFLINE' AND UPPER(session_type) = 'LECTURE'
              AND REPLACE(LOWER(resource_id), '-', '') IN UNNEST(@ids) GROUP BY 1`,
    params: { ids, uid },
  });
  const by = new Map((rows as Record<string, unknown>[]).map((r) => [plain(r.id), r]));
  console.log(`${employeeId}: TeachOS ${uid || "not found"}\n\n# | lecture | lecture sessions using this ID (all) | ${employeeId}'s | title in BigQuery | course`);
  LIST.forEach(([name, id], i) => {
    const r = by.get(norm(id));
    console.log(`${i + 1} | ${name} | ${r ? plain(r.all_s) : 0} | ${r ? plain(r.hers) : 0} | ${r ? plain(r.rt) : "-"} | ${r ? plain(r.course) : "-"}`);
  });

  const [h5] = await bq.query({
    query: `SELECT resource_id, ANY_VALUE(learning_portal_course_title) AS course, COUNT(DISTINCT session_id) AS n FROM ${t}
            WHERE institute_type = 'NIAT_OFFLINE' AND TRIM(resource_title) = 'Introduction to HTML5' GROUP BY 1 ORDER BY 3 DESC`,
  });
  console.log(`\nUnit IDs actually used with the title "Introduction to HTML5":`);
  for (const r of h5 as Record<string, unknown>[]) console.log(`  ${plain(r.resource_id)} | ${plain(r.course)} | ${plain(r.n)} sessions`);

  if (uid) {
    const [mine] = await bq.query({
      query: `SELECT session_id, CAST(MIN(DATE(session_start_datetime)) AS STRING) AS d, ANY_VALUE(session_title) AS title,
                LOGICAL_OR(REPLACE(LOWER(resource_id), '-', '') IN UNNEST(@ids)) AS hit
              FROM ${t} WHERE instructor_user_id = @uid AND UPPER(session_type) = 'LECTURE' AND session_start_datetime <= CURRENT_DATETIME()
              GROUP BY 1 ORDER BY 2`,
      params: { ids, uid },
    });
    const miss = (mine as Record<string, unknown>[]).filter((r) => !r.hit);
    console.log(`\n${employeeId}: ${mine.length} lecture sessions, ${mine.length - miss.length} use a unit ID from lectures 1-21 of this list. Not matched:`);
    for (const r of miss) console.log(`  ${plain(r.d)} | ${plain(r.title)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
