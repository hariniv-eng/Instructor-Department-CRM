// One-off, READ-ONLY (2026-10-27, per request: "check in the Darwin data if attendance is anywhere"). Looks for attendance-type data
// (attendance / present / absent / leave / punch / check-in / shift / working days / WFH / holiday) in everything we already pull:
//   1) the Darwin full roster (Master API, every field kept by the sync)
//   2) the Darwin Reports Builder reports we use (exit report + the enrichment reports in DBX_CHECK_ENRICH_REPORT_IDS)
//   3) every table/column in the BigQuery dataset (INFORMATION_SCHEMA)
// Prints only field / column names, how many rows have a value, and one short sample for matching fields. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_attendance_search.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, darwinboxFullRosterTable } from "@workspace/db";
import { config } from "./config";
import { fetchExitRecords, fetchEnrichmentRecords, parseEnrichReportIds } from "./darwinboxExits";

const RX = /attend|present|absent|leave|punch|check.?in|check.?out|clock|shift|working.?day|work.?from|wfh|holiday|biometric|swipe|time.?in|time.?out|lop|loss.?of.?pay|regulari/i;
function scan(label: string, records: Record<string, unknown>[]) {
  const stats = new Map<string, { n: number; sample: string }>();
  for (const r of records) for (const [k, v] of Object.entries(r ?? {})) {
    const s = stats.get(k) ?? { n: 0, sample: "" };
    if (v !== null && v !== undefined && String(v).trim() !== "") { s.n++; if (!s.sample) s.sample = String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 40); }
    stats.set(k, s);
  }
  const hits = [...stats].filter(([k]) => RX.test(k));
  console.log(`\n${label}: ${records.length} records, ${stats.size} fields. Attendance-type fields: ${hits.length ? "" : "NONE"}`);
  for (const [k, s] of hits) console.log(`   ${k} | filled for ${s.n} | e.g. ${s.sample || "-"}`);
}

async function main() {
  const roster = await db.select().from(darwinboxFullRosterTable);
  scan("1) Darwin full roster (Master API)", roster.map((r) => (r.rawData as Record<string, unknown>) ?? {}));
  try { scan("2a) Darwin exit report", await fetchExitRecords()); } catch (e) { console.log(`\n2a) Darwin exit report: could not read (${(e as Error).message})`); }
  for (const id of parseEnrichReportIds()) {
    try { scan(`2b) Darwin report ${id}`, await fetchEnrichmentRecords(id)); } catch (e) { console.log(`\n2b) Darwin report ${id}: could not read (${(e as Error).message})`); }
  }
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const [cols] = await bq.query({ query: `SELECT table_name, column_name, data_type FROM \`${ds}.INFORMATION_SCHEMA.COLUMNS\`` });
  const all = cols as { table_name: string; column_name: string; data_type: string }[];
  const tables = [...new Set(all.map((c) => c.table_name))];
  const tHits = tables.filter((t) => RX.test(t));
  const cHits = all.filter((c) => RX.test(c.column_name));
  console.log(`\n3) BigQuery ${ds}: ${tables.length} tables. Tables with an attendance-type name: ${tHits.length ? tHits.join(", ") : "NONE"}`);
  console.log(`   Columns with an attendance-type name (${cHits.length}):`);
  for (const c of cHits) console.log(`   ${c.table_name}.${c.column_name} (${c.data_type})`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
