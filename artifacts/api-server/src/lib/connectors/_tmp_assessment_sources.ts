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

  // Follow the chain of views (2026-11-11: the table is a view on another dataset's table of the same name), up to 4 levels: describe
  // each table, read-test it, and go on to every table its SQL mentions (any quoting: `p.d.t`, `p`.`d`.`t`, `d.t`, `d`.`t`).
  const ds = config.BIGQUERY_DATASET!;
  const seen = new Set<string>();
  const follow = async (dataset: string, table: string, project: string, depth: number) => {
    const key = `${project}.${dataset}.${table}`;
    if (seen.has(key) || depth > 4) return;
    seen.add(key);
    const m = project === P ? await describe(dataset, table) : null;
    await canRead(key);
    const sql = String(m?.view?.query ?? "").replace(/`/g, "");
    for (const x of sql.matchAll(/\b([\w-]+)\.([\w-]+)\.([\w-]+)\b|\b(?:FROM|JOIN)\s+([\w-]+)\.([\w-]+)\b/gi)) {
      if (x[1]) await follow(x[2], x[3], x[1], depth + 1); else if (x[4]) await follow(x[4], x[5], P, depth + 1);
    }
  };
  await follow(ds, "z_niat_tech_instrctor_trainee_exam_best_scores_details", P, 0);
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
