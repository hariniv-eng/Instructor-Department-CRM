// One-off, READ-ONLY (2026-11-23, per request: "NW2000671 -- who marked him Payroll Converted, when, or was it automatic?").
// "Payroll" in FCC can come from two places:
//   (a) AUTOMATIC: classification payroll_converted, set by the sync for a TeachOS-only person with no Darwin record anywhere
//   (b) MANUAL: Employee Status (exit_verification) = payroll_converted, chosen by a Capability Manager on the page
// For one employee ID this prints both, his Darwin presence / exit records, and every change-log row that mentions him (Employee Status
// and Date of exit changes are logged since 9 Nov 2026; who made the change only from 23 Nov). Dates and statuses only, no names.
//   pnpm exec tsx src/lib/connectors/_tmp_payroll_mark_history.ts NW2000671
import { sql, like, desc } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable, uploadsTable } from "@workspace/db";
import { isPayrollPerson } from "../../routes/reports";

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "").trim().toUpperCase();
  for (const r of await db.select().from(instructorsTable).where(sql`UPPER(TRIM(${instructorsTable.employeeId})) = ${emp}`))
    console.log(`LIVE row ${r.id}: classification ${r.classification ?? "-"} | Employee Status (CM mark) ${r.exitVerification ?? "(empty)"} | payroll by app rule ${isPayrollPerson(r)} | in Darwin ${r.inDarwin} | in TeachOS ${r.inTeachos} | exit record ${r.exitFlag ? `${r.exitFlagStatus ?? "-"} ${r.exitFlagDate ?? ""}` : "none"} | typed date of exit ${r.manualExitDate ?? "-"}`);
  for (const a of await db.select().from(instructorArchiveTable).where(sql`UPPER(TRIM(${instructorArchiveTable.employeeId})) = ${emp}`))
    console.log(`ARCHIVE row ${a.id}: classification ${a.classification ?? "-"} | Employee Status ${a.exitVerification ?? "(empty)"}`);
  const exits = await db.select().from(darwinboxExitsTable).where(sql`UPPER(TRIM(${darwinboxExitsTable.employeeId})) = ${emp}`);
  for (const e of exits) { const raw = e.rawData as Record<string, unknown>; console.log(`DARWIN EXIT record ${e.id}: status ${raw["Status"] ?? "-"} | exit date (raised) ${raw["Exit Date"] ?? "-"} | date of exit ${raw["Date Of Exit"] ?? "-"} | type ${raw["Exit Type"] ?? raw["Separation Type"] ?? "-"}`); }
  if (!exits.length) console.log("DARWIN EXIT records: none");
  const log = await db.select().from(uploadsTable).where(like(uploadsTable.filename, `%${emp}%`)).orderBy(desc(uploadsTable.uploadedAt));
  console.log(`\nChange log rows mentioning ${emp} (${log.length}), newest first (IST):`);
  for (const l of log) console.log(`  ${new Date(l.uploadedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} | ${l.source} | ${l.filename}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
