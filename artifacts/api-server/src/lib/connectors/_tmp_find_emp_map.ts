// One-off, READ-ONLY (2026-11-18). For the first-class-date request: 318 of the 399 (exited) instructors have no TeachOS id in FCC and the
// session schedule table has no email column (and starts 2025-07-15). Searches every readable BigQuery dataset for:
//   A. tables with an employee-id-like column (employee_id, emp_id, employee_code ...) -> how many of the missing IDs each one has, and
//      whether it also has a user id / email column (= a way from employee ID to TeachOS user id)
//   B. tables with an email column next to a user id column (email -> user id)
//   C. session tables (session_start_datetime + instructor_user_id) and how far back each goes (older class history than 2025-07-15?)
// Table / column names and counts only.
//   pnpm exec tsx src/lib/connectors/_tmp_find_emp_map.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";
import { config } from "./config";
import { IDS } from "./_tmp_first_class_ids";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const key = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();

async function main() {
  const known = new Set<string>();
  for (const r of await db.select({ e: instructorsTable.employeeId, u: instructorsTable.teachosUserId }).from(instructorsTable)) if (r.e && r.u) known.add(key(r.e));
  for (const r of await db.select({ e: instructorArchiveTable.employeeId, u: instructorArchiveTable.teachosUserId }).from(instructorArchiveTable)) if (r.e && r.u) known.add(key(r.e));
  const missing = IDS.map(key).filter((i) => !known.has(i));
  console.log(`Missing a TeachOS id: ${missing.length} of ${IDS.length}`);
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [datasets] = await bq.getDatasets();
  const empRe = /^(employee_?(id|code|no|number)|emp_?(id|code|no)|employeeid|nw_?id)$/i;
  const userRe = /^(instructor_)?user_id$|^teachos_user_id$/i;
  const mailRe = /mail/i;
  for (const d of datasets) {
    let cols: Record<string, unknown>[];
    try { [cols] = await bq.query({ query: `SELECT table_name t, column_name c FROM \`${P}.${d.id}.INFORMATION_SCHEMA.COLUMNS\`` }) as unknown as [Record<string, unknown>[]]; }
    catch { console.log(`\n[${d.id}] not searchable`); continue; }
    const byT = new Map<string, string[]>();
    for (const r of cols) byT.set(plain(r.t), [...(byT.get(plain(r.t)) ?? []), plain(r.c)]);
    for (const [t, cs] of byT) {
      const emp = cs.find((c) => empRe.test(c)), user = cs.find((c) => userRe.test(c)), mail = cs.find((c) => mailRe.test(c));
      const sess = cs.includes("session_start_datetime") && cs.some((c) => /instructor_user_id/i.test(c));
      if (!emp && !(user && mail) && !sess) continue;
      const T = `\`${P}.${d.id}.${t}\``;
      try {
        if (emp) {
          const [r] = await bq.query({ query: `SELECT COUNT(DISTINCT UPPER(TRIM(CAST(${emp} AS STRING)))) n FROM ${T} WHERE UPPER(TRIM(CAST(${emp} AS STRING))) IN UNNEST(@ids)`, params: { ids: missing }, types: { ids: ["STRING"] } });
          console.log(`A ${d.id}.${t}: ${emp} has ${plain((r as Record<string, unknown>[])[0].n)} of the ${missing.length} | user id col ${user ?? "-"} | email col ${mail ?? "-"}`);
        } else if (user && mail) console.log(`B ${d.id}.${t}: ${user} + ${mail}`);
        if (sess) {
          const [r] = await bq.query({ query: `SELECT MIN(CAST(session_start_datetime AS STRING)) lo, COUNT(*) n FROM ${T}` });
          const x = (r as Record<string, unknown>[])[0];
          console.log(`C ${d.id}.${t}: sessions from ${plain(x.lo).slice(0, 10)} (${plain(x.n)} rows) | email col ${mail ?? "-"} | emp col ${emp ?? "-"}`);
        }
      } catch (e) { console.log(`  ${d.id}.${t}: not readable (${(e as Error).message.slice(0, 80)})`); }
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
