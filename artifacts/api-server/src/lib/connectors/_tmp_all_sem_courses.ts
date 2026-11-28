// One-off, READ-ONLY (2026-11-28, per request: "get me all the subjects' names from Sem 1 to Sem 6 -- leave Aurora out"). From
// niat_schedule_details_as_per_prod_sequence (FCC's own BigQuery dataset), NIAT_OFFLINE batches only, Aurora left out: for each semester,
// every course title with its category, the FCC subject it maps to (taughtSubjectColumn, by title), how many batches / universities have it,
// distinct lectures, and the batches when only a few. No people. Writes all_sem_courses.csv (courses only, safe to keep).
//   pnpm exec tsx src/lib/connectors/_tmp_all_sem_courses.ts
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { taughtSubjectColumn } from "./taughtTraining";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const csv = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `SELECT semester_title AS s, course_title AS t, ANY_VALUE(course_category) AS cat,
      COUNT(DISTINCT batch_name) AS batches, COUNT(DISTINCT institute_name) AS unis,
      MAX(lec) AS lec, STRING_AGG(DISTINCT batch_name, '; ' LIMIT 6) AS bl
    FROM (SELECT *, COUNT(DISTINCT IF(session_type = 'LECTURE', session_id, NULL)) OVER (PARTITION BY semester_title, course_title, batch_name) AS lec
          FROM \`${P}.${DS}.niat_schedule_details_as_per_prod_sequence\`
          WHERE institute_type = 'NIAT_OFFLINE' AND NOT REGEXP_CONTAINS(LOWER(CONCAT(IFNULL(batch_name, ''), ' ', IFNULL(institute_name, ''))), r'aurora'))
    GROUP BY 1, 2 ORDER BY 1, 3, 4 DESC, 2` });
  const out = [["semester", "course_title", "category", "fcc_subject", "batches", "universities", "max_lectures_in_a_batch", "batches_sample"].join(",")];
  let last = "";
  const subj = new Map<string, Set<string>>();
  for (const r of rows as Record<string, unknown>[]) {
    const s = plain(r.s), t = plain(r.t);
    const fcc = taughtSubjectColumn("", t) ?? "(orientation / general)";
    if (s !== last) { console.log(`\n===== ${s}`); last = s; }
    console.log(`  ${plain(r.cat).padEnd(17)} | ${t} | FCC: ${fcc} | ${plain(r.batches)} batches, ${plain(r.unis)} universities | ${plain(r.lec)} lectures${Number(plain(r.batches)) <= 3 ? ` | ${plain(r.bl)}` : ""}`);
    out.push([s, t, plain(r.cat), fcc, plain(r.batches), plain(r.unis), plain(r.lec), plain(r.bl)].map(csv).join(","));
    const k = s; const set = subj.get(k) ?? new Set<string>(); set.add(fcc); subj.set(k, set);
  }
  console.log("\nFCC subjects per semester:");
  for (const [s, set] of subj) console.log(`  ${s}: ${[...set].join(", ")}`);
  fs.writeFileSync("all_sem_courses.csv", out.join("\n"));
  console.log("\nWrote all_sem_courses.csv (courses only, no people).");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
