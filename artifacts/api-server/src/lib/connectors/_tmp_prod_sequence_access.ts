// One-off, READ-ONLY (2026-11-26, per request: "can you access niat_schedule_details_as_per_prod_sequence in BigQuery" -- the table the
// SPI dashboard uses for the semester-wise course / lecture sequence; needed for Semesters 4-6 in Deployed - Readiness).
// Tries the table in kossip-helpers.niat_instructor_efficacy_ai_analytics_workspace and, in case the data team copied it there, in FCC's own
// dataset. For the first one that is readable: row count, columns, and for short-valued columns the top values (names / emails / urls hidden),
// then semester x course counts if such columns exist. No names printed.
//   pnpm exec tsx src/lib/connectors/_tmp_prod_sequence_access.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const TABLE = "niat_schedule_details_as_per_prod_sequence";
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const hide = /name|mail|phone|mobile|url|link|remark|comment|feedback|transcript|instructor_id|user_id/i;

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const places = [["kossip-helpers", "niat_instructor_efficacy_ai_analytics_workspace"], [P, config.BIGQUERY_DATASET!]];
  for (const [proj, ds] of places) {
    const full = `\`${proj}.${ds}.${TABLE}\``;
    console.log(`\n=== ${proj === P && ds === config.BIGQUERY_DATASET ? "FCC's own dataset" : `${proj}.${ds}`}.${TABLE}`);
    try {
      const [cols] = await bq.query({ query: `SELECT column_name, data_type FROM \`${proj}.${ds}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`, params: { t: TABLE } });
      const list = (cols as Record<string, unknown>[]).map((c) => [plain(c.column_name), plain(c.data_type)] as [string, string]);
      if (!list.length) { console.log("  not found here (no such table, or no access to its schema)"); continue; }
      const [[cnt]] = await bq.query({ query: `SELECT COUNT(*) AS n FROM ${full}` });
      console.log(`  READABLE: ${plain((cnt as Record<string, unknown>).n)} rows, ${list.length} columns`);
      for (const [c, t] of list) {
        if (hide.test(c) || !/STRING|INT|BOOL/.test(t)) { console.log(`  - ${c} (${t})`); continue; }
        const [top] = await bq.query({ query: `SELECT CAST(${c} AS STRING) AS v, COUNT(*) AS n, COUNT(DISTINCT CAST(${c} AS STRING)) OVER () AS d FROM ${full} GROUP BY 1 ORDER BY n DESC LIMIT 8` });
        const rows = top as Record<string, unknown>[];
        const d = rows.length ? plain(rows[0].d) : "0";
        console.log(`  - ${c} (${t}) -- ${d} distinct: ${rows.map((r) => `${plain(r.v).slice(0, 40)} [${plain(r.n)}]`).join(" | ")}`);
      }
      const sem = list.find(([c]) => /semester|sem_/i.test(c))?.[0];
      const course = list.find(([c]) => /course.*(title|name)/i.test(c))?.[0];
      if (sem && course) {
        const [sc] = await bq.query({ query: `SELECT CAST(${sem} AS STRING) AS s, CAST(${course} AS STRING) AS c, COUNT(*) AS n FROM ${full} GROUP BY 1, 2 ORDER BY 1, 3 DESC` });
        console.log(`\n  ${sem} x ${course}:`);
        for (const r of sc as Record<string, unknown>[]) console.log(`    ${plain(r.s)} | ${plain(r.c).slice(0, 70)} | ${plain(r.n)}`);
      }
      break;
    } catch (e) {
      console.log(`  NOT READABLE: ${(e as Error).message.slice(0, 300)}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
