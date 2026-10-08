// One-off (2026-10-07): follows the chain behind niat_instructor_details.
// That view selects from `kossip-helpers`.`niat_efficacy_bases`.`niat_instructor_details`
// (note the backtick-separated parts, which the first version mis-parsed).
// For each level prints type / last-modified / row count / creation time, and
// if it is another view, its SQL, then follows that view's tables too. Read-only.
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";

const client = (project: string) => new BigQuery({ projectId: project, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
const seen = new Set<string>();

function refsIn(sql: string): string[] {
  const out = new Set<string>();
  // `a`.`b`.`c`  |  `a.b.c`  |  `a`.`b.c`
  for (const m of sql.matchAll(/`([^`]+)`(?:\.`([^`]+)`)?(?:\.`([^`]+)`)?/g)) {
    const joined = [m[1], m[2], m[3]].filter(Boolean).join(".");
    if (joined.split(".").length >= 3) out.add(joined);
  }
  return Array.from(out);
}

async function inspect(ref: string, depth: number) {
  if (seen.has(ref) || depth > 5) return;
  seen.add(ref);
  const [project, dataset, table] = ref.split(".");
  const pad = "  ".repeat(depth);
  try {
    const [m] = await client(project).dataset(dataset).table(table).getMetadata();
    const fmt = (v: unknown) => (v ? new Date(Number(v)).toISOString() : "?");
    console.log(`${pad}${ref}: type=${m.type} | lastModified=${fmt(m.lastModifiedTime)} | created=${fmt(m.creationTime)} | numRows=${m.numRows ?? "?"}${m.timePartitioning ? ` | partitioned(${m.timePartitioning.field ?? "ingestion"})` : ""}`);
    if (m.type === "VIEW" && m.view?.query) {
      console.log(`${pad}  SQL: ${String(m.view.query).replace(/\s+/g, " ").slice(0, 900)}`);
      for (const r of refsIn(m.view.query)) await inspect(r, depth + 1);
    }
  } catch (e) {
    console.log(`${pad}${ref}: could not read metadata (${(e as Error).message})`);
  }
}

async function main() {
  await inspect("kossip-helpers.niat_efficacy_bases.niat_instructor_details", 0);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
