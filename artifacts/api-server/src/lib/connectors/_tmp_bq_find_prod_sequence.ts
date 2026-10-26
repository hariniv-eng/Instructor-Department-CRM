// One-off, READ-ONLY (2026-10-26). Looks through every BigQuery dataset/table this account can see for anything that holds
// the "prod sequence" (course curriculum order: course, topic, session/unit name, slot/week, unit id, session type).
// Step 1: table names that look like curriculum/sequence tables. Step 2: column names that look like sequence columns.
// Step 3: for the best matches, prints the columns and 3 sample rows. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_bq_find_prod_sequence.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const TABLE_HINT = /seq|sequence|curricul|syllabus|prod|plan|slot|lesson|unit|session_master|course_structure|course_content|content|topic|schedule|week/i;
const COL_HINT = /seq|sequence|slot|week_no|week_number|order|position|rank|unit_id|session_name_enum|enum|lesson|topic_id|unit_type|content_type/i;

async function main() {
  const creds = config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {};
  const projects = [...new Set([config.BIGQUERY_PROJECT_ID!, "kossip-helpers", ...(process.argv.slice(2))])];
  const hits: { id: string; why: string; score: number }[] = [];
  for (const project of projects) {
    const bq = new BigQuery({ projectId: project, ...creds });
    let datasets: string[] = [];
    try { const [ds] = await bq.getDatasets(); datasets = ds.map((d) => d.id!); }
    catch (e) { console.log(`${project}: cannot list datasets (${(e as Error).message.slice(0, 120)})`); }
    for (const extra of [config.BIGQUERY_DATASET!, "niat_efficacy_bases"]) if (!datasets.includes(extra)) datasets.push(extra);
    console.log(`\n=== Project ${project}: ${datasets.length} datasets: ${datasets.join(", ")}`);
    for (const ds of datasets) {
      // Column-level search via INFORMATION_SCHEMA (one query per dataset).
      try {
        const [rows] = await bq.query({ query: `SELECT table_name, STRING_AGG(column_name, ', ' ORDER BY ordinal_position) AS cols FROM \`${project}.${ds}.INFORMATION_SCHEMA.COLUMNS\` GROUP BY table_name`, location: "US" }).catch(() => bq.query({ query: `SELECT table_name, STRING_AGG(column_name, ', ' ORDER BY ordinal_position) AS cols FROM \`${project}.${ds}.INFORMATION_SCHEMA.COLUMNS\` GROUP BY table_name` }));
        console.log(`  ${ds}: ${rows.length} tables/views`);
        for (const r of rows as { table_name: string; cols: string }[]) {
          const cols = r.cols.split(", ");
          const colHits = cols.filter((c) => COL_HINT.test(c));
          const nameHit = TABLE_HINT.test(r.table_name);
          const score = (nameHit ? 2 : 0) + colHits.length + (cols.some((c) => /unit_id/i.test(c)) && cols.some((c) => /seq|order|slot|position|week/i.test(c)) ? 5 : 0);
          if (score >= 3) hits.push({ id: `${project}.${ds}.${r.table_name}`, why: `name ${nameHit ? "matches" : "no"}; columns: ${colHits.join(", ")} | all: ${r.cols.slice(0, 400)}`, score });
        }
      } catch (e) {
        // Fall back to just listing table names.
        try {
          const [tables] = await bq.dataset(ds, { projectId: project }).getTables();
          console.log(`  ${ds}: ${tables.length} tables (no column access: ${(e as Error).message.slice(0, 80)})`);
          for (const t of tables) if (TABLE_HINT.test(t.id!)) hits.push({ id: `${project}.${ds}.${t.id}`, why: "name matches (columns not readable)", score: 2 });
        } catch (e2) { console.log(`  ${ds}: not readable (${(e2 as Error).message.slice(0, 100)})`); }
      }
    }
  }
  hits.sort((a, b) => b.score - a.score);
  console.log(`\n=== Candidates (${hits.length}), best first ===`);
  for (const h of hits.slice(0, 40)) console.log(`[${h.score}] ${h.id}\n      ${h.why}`);
  console.log(`\n=== Sample rows from the top 5 ===`);
  for (const h of hits.slice(0, 5)) {
    const [p] = h.id.split(".");
    try {
      const [rows] = await new BigQuery({ projectId: p, ...creds }).query({ query: `SELECT * FROM \`${h.id}\` LIMIT 3` });
      console.log(`\n${h.id}:`); for (const r of rows) console.log("  " + JSON.stringify(r).slice(0, 600));
    } catch (e) { console.log(`\n${h.id}: sample failed (${(e as Error).message.slice(0, 120)})`); }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
