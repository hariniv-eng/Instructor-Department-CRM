// One-off, READ-ONLY (2026-11-13, per request: where do "preparedness demos" come from?). For each view named on the command line
// (dataset.table; default: the two candidates found by _tmp_find_prep_demos.ts): can FCC read it, row count, distinct instructors,
// every column with how many distinct values / empty, and for short-valued columns the top 10 values. Columns that look like names,
// emails, phones or ids show no values.
//   pnpm exec tsx src/lib/connectors/_tmp_inspect_views.ts [dataset.table ...]
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const views = args.length ? args : ["niat_reverse_etl_bases.niat_pre_lecture_readiness_check_list_details", "niat_instructor_automation_data.z_niat_training_instructors_online_demo_details"];
  const hide = /name|mail|phone|mobile|contact|url|link/i;
  for (const v of views) {
    const T = `\`${P}.${v}\``;
    console.log(`\n================ ${v}`);
    let cols: string[] = [];
    try {
      const [r] = await bq.query({ query: `SELECT * FROM ${T} LIMIT 1` });
      cols = Object.keys((r as Record<string, unknown>[])[0] ?? {});
    } catch (e) { console.log(`  NOT READABLE: ${(e as Error).message.slice(0, 200)}`); continue; }
    const userCol = cols.find((c) => /instructor_user_id|^user_id$/i.test(c));
    const [cnt] = await bq.query({ query: `SELECT COUNT(*) AS n${userCol ? `, COUNT(DISTINCT ${userCol}) AS people` : ""} FROM ${T}` });
    const c0 = (cnt as Record<string, unknown>[])[0];
    console.log(`  rows ${plain(c0.n)}${userCol ? ` | instructors ${plain(c0.people)}` : ""}\n  columns (${cols.length}): ${cols.join(", ")}`);
    for (const c of cols) {
      const [s] = await bq.query({ query: `SELECT COUNT(DISTINCT CAST(\`${c}\` AS STRING)) AS d, COUNTIF(\`${c}\` IS NULL) AS e, MIN(CAST(\`${c}\` AS STRING)) AS lo, MAX(CAST(\`${c}\` AS STRING)) AS hi FROM ${T}` });
      const x = (s as Record<string, unknown>[])[0];
      const head = `  ${c}: distinct ${plain(x.d)}, empty ${plain(x.e)}`;
      if (hide.test(c) || /(^|_)id$|_ids?$/i.test(c)) { console.log(`${head} (values hidden)`); continue; }
      if (Number(plain(x.d)) > 40) { console.log(`${head} | ${plain(x.lo).slice(0, 30)} .. ${plain(x.hi).slice(0, 30)}`); continue; }
      const [top] = await bq.query({ query: `SELECT CAST(\`${c}\` AS STRING) AS v, COUNT(*) AS n FROM ${T} GROUP BY v ORDER BY n DESC LIMIT 10` });
      console.log(`${head}\n      ${(top as Record<string, unknown>[]).map((t) => `${plain(t.v).slice(0, 50) || "(blank)"} [${plain(t.n)}]`).join(" | ")}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
