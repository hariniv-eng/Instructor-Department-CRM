// One-off, READ-ONLY (2026-11-11, per request: "can we access niat_instructor_trainee_topin_assessment_config in any way?"). For the
// assessment table and the config table: what kind of table each is (normal table / view / external Google Sheet), the Google Sheet link
// behind an external one, the SQL of a view, and -- for every table the view reads -- whether FCC can read it. No staff data printed.
//   pnpm exec tsx src/lib/connectors/_tmp_assessment_sources.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const P = config.BIGQUERY_PROJECT_ID!;

async function main() {
  const creds = config.BIGQUERY_CREDENTIALS_JSON ? JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) : undefined;
  const bq = new BigQuery({ projectId: P, ...(creds ? { credentials: creds } : {}), scopes: ["https://www.googleapis.com/auth/bigquery", "https://www.googleapis.com/auth/drive.readonly"] });
  const describe = async (dataset: string, table: string) => {
    try {
      const [meta] = await bq.dataset(dataset).table(table).getMetadata();
      const m = meta as Record<string, any>;
      console.log(`\n${dataset}.${table}: type ${m.type}`);
      if (m.externalDataConfiguration) console.log(`  EXTERNAL source: ${m.externalDataConfiguration.sourceFormat} ${JSON.stringify(m.externalDataConfiguration.sourceUris ?? [])}`);
      if (m.view?.query) console.log(`  VIEW SQL:\n${String(m.view.query).split("\n").map((l: string) => "    " + l).join("\n")}`);
      return m;
    } catch (e) { console.log(`\n${dataset}.${table}: cannot read its definition (${(e as Error).message.slice(0, 150)})`); return null; }
  };
  const canRead = async (ref: string) => {
    try { const [r] = await bq.query({ query: `SELECT COUNT(*) AS n FROM \`${ref}\`` }); console.log(`  READ ${ref}: OK, ${plain((r as Record<string, unknown>[])[0]?.n)} rows`); }
    catch (e) { console.log(`  READ ${ref}: FAILED -- ${(e as Error).message.slice(0, 150)}`); }
  };

  const ds = config.BIGQUERY_DATASET!;
  const main1 = await describe(ds, "z_niat_tech_instrctor_trainee_exam_best_scores_details");
  // Every table the view's SQL mentions, then the config table by name in every dataset.
  const sqlText = String(main1?.view?.query ?? "");
  const refs = new Set([...sqlText.matchAll(/`([\w-]+\.[\w-]+\.[\w-]+)`|`([\w-]+\.[\w-]+)`/g)].map((m) => m[1] ?? `${P}.${m[2]}`));
  console.log(`\nTables the view reads: ${refs.size ? [...refs].join(", ") : "(none found / not a view)"}`);
  for (const ref of refs) await canRead(ref);
  const [datasets] = await bq.getDatasets();
  for (const d of datasets) {
    try {
      const [t] = await bq.query({ query: `SELECT table_name, table_type FROM \`${P}.${d.id}.INFORMATION_SCHEMA.TABLES\` WHERE table_name LIKE '%topin%config%' OR table_name LIKE '%trainee%config%'` });
      for (const r of t as Record<string, unknown>[]) { await describe(d.id!, plain(r.table_name)); await canRead(`${P}.${d.id}.${plain(r.table_name)}`); }
    } catch { /* dataset not searchable */ }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
