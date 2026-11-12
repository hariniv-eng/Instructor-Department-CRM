// One-off, READ-ONLY (2026-11-12, per request: topin exam data in FCC for ALL subjects). Groups every assessment title by its naming
// pattern so each series can be mapped to a Training Stats course column:
//   1. snake_case series (e.g. python_lists_day10): grouped by their first word, then first two words -- titles, instructors, examples
//   2. the 80 most-taken titles that are NOT snake_case series
// Titles and counts only; no staff names.
//   pnpm exec tsx src/lib/connectors/_tmp_topin_prefixes.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.niat_instructor_automation_data.z_niat_tech_instrctor_trainee_exam_best_scores_details\``;
  const [rows] = await bq.query({ query: `SELECT assessment_title AS t, ANY_VALUE(exam_type) AS ty, COUNT(DISTINCT instructor_user_id) AS people, MIN(exam_attempt_start_date) AS lo, MAX(exam_attempt_start_date) AS hi FROM ${T} GROUP BY t` });
  const all = (rows as Record<string, unknown>[]).map((r) => ({ t: plain(r.t).trim(), ty: plain(r.ty), people: Number(plain(r.people)), lo: plain(r.lo), hi: plain(r.hi) }));
  const snake = all.filter((r) => /^[a-z0-9]+(_[a-z0-9]+)+$/i.test(r.t));
  const other = all.filter((r) => !snake.includes(r));
  const by1 = new Map<string, typeof all>();
  for (const r of snake) { const k = r.t.toLowerCase().split("_")[0]; by1.set(k, [...(by1.get(k) ?? []), r]); }
  console.log(`1. snake_case series: ${snake.length} titles in ${by1.size} first-word groups\n`);
  for (const [k, list] of [...by1].sort((a, b) => b[1].length - a[1].length)) {
    const by2 = new Map<string, typeof all>();
    for (const r of list) { const k2 = r.t.toLowerCase().split("_").slice(0, 2).join("_"); by2.set(k2, [...(by2.get(k2) ?? []), r]); }
    const people = Math.max(...list.map((r) => r.people));
    console.log(`${k}_* : ${list.length} titles | up to ${people} instructors | ${list.map((r) => r.lo).sort()[0]} .. ${list.map((r) => r.hi).sort().slice(-1)[0]}`);
    for (const [k2, l2] of [...by2].sort((a, b) => b[1].length - a[1].length).slice(0, 8)) console.log(`     ${k2}_* (${l2.length}): ${l2.slice(0, 3).map((r) => r.t).join(", ")}`);
  }
  console.log(`\n2. Other titles (${other.length}), the 80 taken by the most instructors:`);
  for (const r of other.sort((a, b) => b.people - a.people).slice(0, 80)) console.log(`  ${r.t.slice(0, 80)} [${r.ty}] ${r.people} people | ${r.lo} .. ${r.hi}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
