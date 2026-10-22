// One-off, READ-ONLY (2026-10-22). Follow-up to _tmp_bq_freshness.ts: every table the app reads is a VIEW, so its "last modified"
// time is only when the view was defined. This reads each view's SQL, finds the tables it reads from (following views inside views,
// up to 3 levels), and prints when each underlying TABLE was last written -- the real freshness of the TeachOS data. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_bq_view_sources.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const ist = (ms: number) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const START: [string, string][] = [
  [config.BIGQUERY_DATASET!, process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details"],
  [config.BIGQUERY_DATASET!, process.env.CAPABILITY_MANAGER_TABLE || "niat_instructor_managers_and_instructors_details"],
];

async function main() {
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const seen = new Set<string>();
  async function walk(project: string, ds: string, t: string, depth: number) {
    const id = `${project}.${ds}.${t}`;
    const pad = "  ".repeat(depth);
    if (seen.has(id)) { console.log(`${pad}${id} (already shown)`); return; }
    seen.add(id);
    try {
      const [meta] = await new BigQuery({ projectId: project, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) }).dataset(ds, { projectId: project }).table(t).getMetadata();
      const m = Number(meta.lastModifiedTime);
      if (meta.type === "VIEW" || meta.type === "MATERIALIZED_VIEW") {
        console.log(`${pad}${id}: ${meta.type}${meta.type === "MATERIALIZED_VIEW" && meta.materializedView?.lastRefreshTime ? `, last refreshed ${ist(Number(meta.materializedView.lastRefreshTime))} IST` : ""}`);
        const sql: string = meta.view?.query ?? meta.materializedView?.query ?? "";
        const refs = new Set<string>();
        for (const mm of sql.matchAll(/`([\w-]+)\.([\w-]+)\.([\w$-]+)`|`([\w-]+)\.([\w$-]+)`|\b([\w-]+)\.([\w-]+)\.([\w$]+)\b/g)) {
          const [p, d, tt] = mm[1] ? [mm[1], mm[2], mm[3]] : mm[4] ? [project, mm[4], mm[5]] : [mm[6], mm[7], mm[8]];
          if (p && d && tt) refs.add(`${p}|${d}|${tt}`);
        }
        if (depth >= 3) { console.log(`${pad}  (stopping: 3 levels deep) reads: ${[...refs].map((r) => r.replace(/\|/g, ".")).join(", ")}`); return; }
        for (const r of refs) { const [p, d, tt] = r.split("|"); await walk(p, d, tt, depth + 1); }
      } else {
        console.log(`${pad}${id}: ${meta.type}, last written ${ist(m)} IST (${((Date.now() - m) / 3600000).toFixed(1)} h ago), ${meta.numRows} rows`);
      }
    } catch (e) {
      console.log(`${pad}${id}: could not read (${(e as Error).message.slice(0, 140)})`);
    }
  }
  console.log(`Now: ${ist(Date.now())} IST\n`);
  for (const [ds, t] of START) { await walk(config.BIGQUERY_PROJECT_ID!, ds, t, 0); console.log(""); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
