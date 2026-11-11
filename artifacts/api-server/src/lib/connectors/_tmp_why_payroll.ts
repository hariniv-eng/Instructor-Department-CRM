// One-off, READ-ONLY (2026-11-10, per request: "this instructor is not payroll converted but is listed as payroll -- why, and since when?").
// Finds the person by (part of) their name, given on the command line (no names are written in this file), and prints everything that
// decides "payroll": their FCC row (in Darwin / in TeachOS, classification and its reason, Employee Status), the employee ID TeachOS gives
// them, Darwin employee records under that ID and under the same name, the archive row, and the Employee Status change log.
//   pnpm exec tsx src/lib/connectors/_tmp_why_payroll.ts "first last"
import { BigQuery } from "@google-cloud/bigquery";
import { sql, desc } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable, darwinboxActiveTable, darwinboxFullRosterTable, uploadsTable } from "@workspace/db";
import { config } from "./config";
import { isPayrollPerson } from "../../routes/reports";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");

async function main() {
  const q = process.argv.slice(2).filter((a) => a !== "--").join(" ").trim();
  if (!q) { console.log('usage: _tmp_why_payroll.ts "name"'); process.exit(1); }
  // An employee ID works too (2026-11-11): "NW0007056" searches the employee ID instead of the name.
  const isId = /^NW\d{7}$/i.test(q);
  const rows = await db.select().from(instructorsTable).where(isId ? sql`UPPER(TRIM(${instructorsTable.employeeId})) = ${q.toUpperCase()}` : sql`${instructorsTable.fullName} ILIKE ${"%" + q + "%"}`);
  console.log(`FCC rows matching "${q}": ${rows.length}`);
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details"}\``;
  for (const r of rows) {
    console.log(`\n=== row ${r.id} | "${r.fullName}" | employee id ${r.employeeId ?? "(none)"}`);
    console.log(`   in Darwin ${r.inDarwin} (full roster ${r.inDarwinFullRoster}) | in TeachOS ${r.inTeachos} | Darwin status ${r.darwinEmployeeStatus ?? "-"} | department "${r.department ?? "-"}" | designation "${r.designation ?? "-"}"`);
    console.log(`   classification ${r.classification ?? "(none)"} | reason: ${r.classificationReason ?? "-"}`);
    console.log(`   Employee Status (CM mark) ${r.exitVerification ?? "(empty)"} | Darwin exit record ${r.exitFlag ? `${r.exitFlagStatus} (${r.exitFlagDate ?? "-"})` : "none"} | counted as PAYROLL by the app: ${isPayrollPerson(r) ? "YES" : "no"}`);
    if (r.teachosUserId) {
      const [t] = await bq.query({ query: `SELECT nw_instructor_id AS eid, instructor_name AS n, instructor_status AS st FROM ${T} WHERE instructor_user_id = @u`, params: { u: r.teachosUserId } });
      for (const x of t as Record<string, unknown>[]) console.log(`   TeachOS says: employee id ${plain(x.eid) || "(none)"} | name "${plain(x.n)}" | status ${plain(x.st)}`);
    }
    const id = (r.employeeId ?? "").trim().toUpperCase();
    for (const [label, table] of [["Darwin active", darwinboxActiveTable], ["Darwin full roster", darwinboxFullRosterTable]] as const) {
      const byId = id ? await db.select().from(table).where(sql`UPPER(TRIM(${table.employeeId})) = ${id}`) : [];
      const byName = (isId ? [] : await db.select().from(table).where(sql`${table.fullName} ILIKE ${"%" + q + "%"}`)).filter((d) => !byId.some((b) => b.id === d.id));
      for (const d of byId) { const raw = d.rawData as Record<string, unknown>; console.log(`   ${label}, SAME employee id: "${d.fullName}" | ${raw["Department"] ?? "-"} | ${raw["Designation"] ?? "-"} | ${raw["Employee Status"] ?? "-"}`); }
      for (const d of byName) { const raw = d.rawData as Record<string, unknown>; console.log(`   ${label}, similar NAME, employee id ${d.employeeId}: "${d.fullName}" | ${raw["Department"] ?? "-"} | ${raw["Designation"] ?? "-"} | ${raw["Employee Status"] ?? "-"} | same full name: ${norm(d.fullName) === norm(r.fullName) ? "yes" : "no"}`); }
      if (!byId.length && !byName.length) console.log(`   ${label}: nothing under this employee id or name`);
    }
    const arch = id ? await db.select().from(instructorArchiveTable).where(sql`UPPER(TRIM(${instructorArchiveTable.employeeId})) = ${id}`) : [];
    for (const a of arch) console.log(`   archive: first seen ${a.firstSeenAt.toISOString().slice(0, 10)} | in Darwin ${a.inDarwin} | classification ${a.classification ?? "-"} | Employee Status ${a.exitVerification ?? "(empty)"}`);
    const log = id ? await db.select().from(uploadsTable).where(sql`${uploadsTable.source} = 'Employee Status change' AND UPPER(${uploadsTable.filename}) LIKE ${id + ":%"}`).orderBy(desc(uploadsTable.uploadedAt)) : [];
    console.log(`   Employee Status change log (since 2026-11-09): ${log.length ? log.map((l) => `${l.uploadedAt.toISOString()} ${l.filename}`).join(" || ") : "none"}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
