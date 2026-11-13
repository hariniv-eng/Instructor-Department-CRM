// One-off, READ-ONLY (2026-11-13, per request: "get the data of one instructor from all the demo tables, to see what each holds").
// For one employee ID: every row for her TeachOS user id in each demo-related BigQuery table, all columns except names / emails /
// phones. Writes demo_tables_<EMP>.json (no names in it) and prints row counts per table.
//   pnpm exec tsx src/lib/connectors/_tmp_demo_tables_person.ts NW2000396
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";

const TABLES = [
  "niat_instructor_automation_data.niat_session_wise_qa_rating",
  "niat_instructor_automation_data.z_niat_instructors_demo_qa_rating_details",
  "niat_reverse_etl_bases.niat_pre_lecture_readiness_check_list_details",
  "niat_instructor_automation_data.z_niat_training_instructors_online_demo_details",
  "niat_reverse_etl_bases.niat_session_wise_qa_rating",
  "niat_reverse_etl_bases.y_niat_grit_user_nxtmock_attempt_details",
];
const hide = /name|mail|phone|mobile|contact/i;
const plain = (v: unknown): unknown => (v && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v);

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  if (!p?.teachosUserId) { console.log(`${emp}: not in FCC or no TeachOS user id`); process.exit(0); }
  const uid = p.teachosUserId;
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const out: Record<string, { user_column: string | null; columns: string[]; rows: Record<string, unknown>[]; note?: string }> = {};
  for (const t of TABLES) {
    const T = `\`${P}.${t}\``;
    try {
      const [one] = await bq.query({ query: `SELECT * FROM ${T} LIMIT 1` });
      const cols = Object.keys((one as Record<string, unknown>[])[0] ?? {});
      const userCol = cols.find((c) => /^instructor_user_id$/i.test(c)) ?? cols.find((c) => /^user_id$/i.test(c)) ?? null;
      const keep = cols.filter((c) => !hide.test(c));
      if (!userCol) { out[t] = { user_column: null, columns: cols, rows: [], note: "no instructor / user id column -- cannot filter to one person" }; console.log(`${t}: no user id column (${cols.length} columns)`); continue; }
      const [rows] = await bq.query({ query: `SELECT ${keep.map((c) => `\`${c}\``).join(", ")} FROM ${T} WHERE REPLACE(LOWER(CAST(${userCol} AS STRING)), '-', '') = @uid`, params: { uid: uid.toLowerCase().replace(/-/g, "") } });
      out[t] = { user_column: userCol, columns: keep, rows: (rows as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)]))) };
      console.log(`${t}: ${out[t].rows.length} rows`);
    } catch (e) {
      out[t] = { user_column: null, columns: [], rows: [], note: `not readable: ${(e as Error).message.slice(0, 200)}` };
      console.log(`${t}: NOT READABLE -- ${(e as Error).message.slice(0, 150)}`);
    }
  }
  const file = `demo_tables_${emp}.json`;
  fs.writeFileSync(file, JSON.stringify({ employee_id: emp, teachos_user_id: uid, tables: out }));
  console.log(`Wrote ${file} (no names / emails). Download it and attach it in the chat.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
