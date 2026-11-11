// One-off, READ-ONLY (2026-11-11, per request: NW0004547's date of exit shows 31 Oct 2025, should be 31 Oct 2026; she is no longer in
// Darwin, so it cannot be changed on the page). Prints every place a date of exit for one employee ID can come from, so the right one is
// fixed: the live row (manual date, Darwin last working day, status), the Instructor Archive row, the stored Darwin exit records, and what
// the Instructor Archive / Exit data pages show for her. Dates and statuses only -- no names.
//   pnpm exec tsx src/lib/connectors/_tmp_exit_date_source.ts NW0004547
import { sql } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable } from "@workspace/db";
import { loadArchivePeople, isPayrollPerson } from "../../routes/reports";

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  for (const r of await db.select().from(instructorsTable).where(sql`UPPER(TRIM(${instructorsTable.employeeId})) = ${emp}`))
    console.log(`LIVE row ${r.id}: in TeachOS ${r.inTeachos} | in Darwin ${r.inDarwin} | classification ${r.classification ?? "-"} | payroll (app rule) ${isPayrollPerson(r)} | Employee Status ${r.exitVerification ?? "(empty)"} | MANUAL date of exit ${r.manualExitDate ?? "-"} | Darwin last working day ${r.exitLastWorkingDate ?? "-"} | exit record ${r.exitFlag ? `${r.exitFlagStatus} raised ${r.exitFlagDate}` : "none"} | old exitDate ${r.exitDate ?? "-"}`);
  for (const a of await db.select().from(instructorArchiveTable).where(sql`UPPER(TRIM(${instructorArchiveTable.employeeId})) = ${emp}`))
    console.log(`ARCHIVE row ${a.id}: in TeachOS ${a.inTeachos} | in Darwin ${a.inDarwin} | classification ${a.classification ?? "-"} | Employee Status ${a.exitVerification ?? "(empty)"} | exitDate ${a.exitDate ?? "-"}`);
  for (const x of await db.select().from(darwinboxExitsTable).where(sql`UPPER(TRIM(${darwinboxExitsTable.employeeId})) = ${emp}`)) {
    const raw = x.rawData as Record<string, unknown>;
    console.log(`DARWIN EXIT record ${x.id}: Status ${raw["Status"] ?? "-"} | Exit Date (raised) ${raw["Exit Date"] ?? "-"} | Date Of Exit ${raw["Date Of Exit"] ?? "-"} | Lwd As Per Notice Period ${raw["Lwd As Per Notice Period"] ?? "-"} | Source ${raw["Exit Source"] ?? "-"}`);
  }
  const p = ((await loadArchivePeople()) as Array<Record<string, unknown>>).find((x) => String(x.employee_id ?? "").toUpperCase() === emp);
  console.log(p ? `ARCHIVE PAGE shows: status ${p.status} | date_of_exit ${p.date_of_exit ?? "-"} | exit_date ${p.exit_date ?? "-"} | exit_status ${p.exit_status ?? "-"} | payroll ${p.is_payroll}` : "Not on the Instructor Archive page");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
