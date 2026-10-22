// One-off, READ-ONLY (2026-10-22, per request: "those 5 are INACTIVE in another application, so the problem is on our side").
// Our sync reads instructor_status from niat_instructor_automation_data.niat_instructor_details (a view over
// niat_efficacy_bases.niat_instructor_details), which still says ACTIVE. This looks for every OTHER table/view in every dataset we can
// read that has instructor_user_id or nw_instructor_id plus a status-like column, and shows what each says for the given people --
// to find the source that the other application uses (and that shows INACTIVE). Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_find_status_source.ts NW2000736 NW0007464 NW0007637 NW2000747 NW2000751
import { BigQuery } from "@google-cloud/bigquery";
import { inArray } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";

async function main() {
  const emps = process.argv.slice(2).filter((a) => a !== "--").map((a) => a.trim().toUpperCase());
  const people = await db.select().from(instructorsTable).where(inArray(instructorsTable.employeeId, emps));
  const uids = people.map((p) => p.teachosUserId).filter((x): x is string => !!x);
  const bq = config.BIGQUERY_CREDENTIALS_JSON
    ? new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) })
    : new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID });
  const [datasets] = await bq.getDatasets();
  console.log(`Datasets we can list: ${datasets.map((d) => d.id).join(", ")}\n`);
  for (const ds of datasets) {
    let cols: { table_name: string; column_name: string }[] = [];
    try {
      [cols] = (await bq.query({ query: `SELECT table_name, column_name FROM \`${config.BIGQUERY_PROJECT_ID}.${ds.id}.INFORMATION_SCHEMA.COLUMNS\`` })) as unknown as [typeof cols];
    } catch (e) { console.log(`${ds.id}: cannot list columns (${(e as Error).message.slice(0, 100)})`); continue; }
    const byTable = new Map<string, string[]>();
    for (const c of cols) { if (!byTable.has(c.table_name)) byTable.set(c.table_name, []); byTable.get(c.table_name)!.push(c.column_name); }
    for (const [t, names] of byTable) {
      const idCol = names.find((n) => n === "instructor_user_id") ?? names.find((n) => n === "user_id");
      const empCol = names.find((n) => n === "nw_instructor_id") ?? names.find((n) => /^(employee_id|emp_id|nw_id)$/i.test(n));
      const statusCols = names.filter((n) => /status|active|is_deleted|deleted|deactivat|enabled/i.test(n));
      if ((!idCol && !empCol) || !statusCols.length) continue;
      const where = [idCol && uids.length ? `CAST(${idCol} AS STRING) IN UNNEST(@uids)` : null, empCol ? `UPPER(CAST(${empCol} AS STRING)) IN UNNEST(@emps)` : null].filter(Boolean).join(" OR ");
      if (!where) continue;
      const nameCol = names.find((n) => /instructor_name|^name$|full_name/i.test(n));
      const sel = [idCol, empCol, nameCol, ...statusCols].filter(Boolean).map((c) => `CAST(${c} AS STRING) AS \`${c}\``).join(", ");
      try {
        const [rows] = await bq.query({ query: `SELECT DISTINCT ${sel} FROM \`${config.BIGQUERY_PROJECT_ID}.${ds.id}.${t}\` WHERE ${where} LIMIT 30`, params: { uids: uids.length ? uids : [""], emps } });
        if (!rows.length) continue;
        console.log(`== ${ds.id}.${t}`);
        for (const r of rows as Record<string, string>[]) console.log(`   ${Object.entries(r).map(([k, v]) => `${k}=${v ?? "-"}`).join(" | ")}`);
      } catch (e) {
        console.log(`== ${ds.id}.${t}: query failed (${(e as Error).message.slice(0, 120)})`);
      }
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
