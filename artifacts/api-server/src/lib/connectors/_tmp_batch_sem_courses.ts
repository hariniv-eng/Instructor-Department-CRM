// One-off, READ-ONLY (2026-11-27, per request: "can I get the course_id's of all the sem-4 CDU subjects"). From
// niat_schedule_details_as_per_prod_sequence (FCC's own BigQuery dataset): every course of one semester in the batches whose name matches,
// with semester_course_id, course title, category, lecture / practice / exam session counts, completed lectures and dates. No people.
// Also writes batch_sem_courses.csv (no names of people, safe to keep).
//   pnpm exec tsx src/lib/connectors/_tmp_batch_sem_courses.ts [batch text, default "CDU"] [semester number, default 4]
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const csv = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const batch = args.find((a) => !/^\d$/.test(a)) ?? "CDU";
  const sem = `Semester ${args.find((a) => /^\d$/.test(a)) ?? "4"}`;
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `SELECT batch_name AS b, semester_course_id AS id, course_title AS t, course_category AS cat,
      COUNTIF(session_type = 'LECTURE') AS lec, COUNTIF(session_type IN ('PRACTICE', 'PRECTICE')) AS pr, COUNTIF(session_type = 'EXAM') AS ex,
      COUNTIF(session_type = 'LECTURE' AND session_status = 'COMPLETED') AS lec_done, COUNT(DISTINCT IF(session_type = 'LECTURE', session_id, NULL)) AS lec_distinct,
      CAST(MIN(DATE(session_start_datetime)) AS STRING) AS first, CAST(MAX(DATE(session_start_datetime)) AS STRING) AS last
    FROM \`${P}.${DS}.niat_schedule_details_as_per_prod_sequence\`
    WHERE semester_title = @sem AND LOWER(batch_name) LIKE LOWER(@b)
    GROUP BY 1, 2, 3, 4 ORDER BY 1, 4, 3`, params: { sem, b: `%${batch}%` } });
  const list = rows as Record<string, unknown>[];
  console.log(`${sem}, batches matching "${batch}": ${list.length} course rows`);
  const out = [["batch", "semester_course_id", "course_title", "category", "lecture_sessions", "distinct_lectures", "lectures_completed", "practice_sessions", "exam_sessions", "first_session", "last_session"].join(",")];
  let last = "";
  for (const r of list) {
    if (plain(r.b) !== last) { console.log(`\n${plain(r.b)}`); last = plain(r.b); }
    console.log(`  ${plain(r.id)} | ${plain(r.cat).padEnd(17)} | ${plain(r.t)} | lectures ${plain(r.lec_distinct)} (done ${plain(r.lec_done)}), practice ${plain(r.pr)}, exams ${plain(r.ex)} | ${plain(r.first)} -> ${plain(r.last)}`);
    out.push([plain(r.b), plain(r.id), plain(r.t), plain(r.cat), plain(r.lec), plain(r.lec_distinct), plain(r.lec_done), plain(r.pr), plain(r.ex), plain(r.first), plain(r.last)].map(csv).join(","));
  }
  fs.writeFileSync("batch_sem_courses.csv", out.join("\n"));
  console.log("\nWrote batch_sem_courses.csv (courses only, no people).");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
