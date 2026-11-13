// One-off, READ-ONLY (2026-11-13, per request: "what about preparedness demos?" -- FCC does not read them anywhere yet). Looks for them:
//   1. every evaluation_type in the QA rating view, with row counts, instructors and date range (is "preparedness" one of them?)
//   2. every table / view in every readable dataset whose name mentions prep / prepared / readiness / demo / mock / qa_rating
//   3. for the QA view: session titles containing "prep" / "readiness" (in case they are DEMOs named that way)
// Counts and names of tables / types only; no staff names.
//   pnpm exec tsx src/lib/connectors/_tmp_find_prep_demos.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { QA_RATING_VIEW } from "./demoTraining";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const V = `\`${P}.${DS}.${QA_RATING_VIEW}\``;
  console.log(`1. evaluation_type in ${QA_RATING_VIEW}:`);
  const [types] = await bq.query({ query: `SELECT evaluation_type AS t, LOWER(status) AS st, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS people, MIN(CAST(session_date AS STRING)) AS lo, MAX(CAST(session_date AS STRING)) AS hi FROM ${V} GROUP BY 1, 2 ORDER BY 1, 2` });
  for (const r of types as Record<string, unknown>[]) console.log(`  ${plain(r.t) || "(blank)"} / ${plain(r.st)}: ${plain(r.n)} rows, ${plain(r.people)} instructors, ${plain(r.lo)} .. ${plain(r.hi)}`);

  console.log(`\n2. Tables / views whose name mentions prep, readiness, demo, mock or qa:`);
  const [datasets] = await bq.getDatasets();
  for (const d of datasets) {
    try {
      const [t] = await bq.query({ query: `SELECT table_name, table_type FROM \`${P}.${d.id}.INFORMATION_SCHEMA.TABLES\` WHERE REGEXP_CONTAINS(LOWER(table_name), r'prep|readiness|demo|mock|qa_rating|qa_')` });
      for (const r of t as Record<string, unknown>[]) console.log(`  ${d.id}.${plain(r.table_name)} (${plain(r.table_type)})`);
    } catch { console.log(`  ${d.id}: not searchable`); }
  }

  console.log(`\n3. QA rows whose session title mentions prep / readiness (by evaluation type):`);
  const [titles] = await bq.query({ query: `SELECT evaluation_type AS t, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS people, ARRAY_AGG(DISTINCT session_title LIMIT 8) AS ex FROM ${V} WHERE REGEXP_CONTAINS(LOWER(IFNULL(session_title, '')), r'prep|readiness') GROUP BY 1 ORDER BY n DESC` });
  if (!(titles as unknown[]).length) console.log("  none");
  for (const r of titles as Record<string, unknown>[]) console.log(`  ${plain(r.t)}: ${plain(r.n)} rows, ${plain(r.people)} instructors | e.g. ${((r.ex as unknown[]) ?? []).map(plain).join(" ; ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
