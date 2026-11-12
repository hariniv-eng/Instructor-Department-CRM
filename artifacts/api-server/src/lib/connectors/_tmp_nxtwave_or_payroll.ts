// One-off, READ-ONLY (2026-11-12, per request: "payroll instructors show as NxtWave in the Exit Breakdown -- why?"). For everyone the
// Exit Breakdown counts as a NxtWave exit (archive Exited + Darwin exit Approved + not payroll), prints what decides payroll and any sign
// that they were payroll: live + archive classification, Employee Status now, every Employee Status change logged, typed date of exit,
// Darwin exit dates, in Darwin / TeachOS. Employee IDs only. Optional: employee IDs on the command line to show only those.
//   pnpm exec tsx src/lib/connectors/_tmp_nxtwave_or_payroll.ts [NW0000000 ...]
import { sql } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable, uploadsTable } from "@workspace/db";
import { loadArchivePeople } from "../../routes/reports";

async function main() {
  const only = process.argv.slice(2).filter((a) => /^NW\d{7}$/i.test(a)).map((a) => a.toUpperCase());
  const arch = await loadArchivePeople();
  const nxt = arch.filter((p) => p.status === "Exited" && (p.exit_status ?? "").trim().toLowerCase() === "approved" && !p.is_payroll)
    .filter((p) => !only.length || only.includes(String(p.employee_id ?? "").toUpperCase()));
  const live = await db.select().from(instructorsTable);
  const archRows = await db.select().from(instructorArchiveTable);
  const exits = await db.select().from(darwinboxExitsTable);
  const log = await db.select().from(uploadsTable).where(sql`${uploadsTable.source} IN ('Employee Status change', 'Date of exit change')`);
  console.log(`Exit Breakdown NxtWave exits checked: ${nxt.length}\n`);
  let suspects = 0;
  for (const p of nxt.sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id)))) {
    const id = String(p.employee_id ?? "").toUpperCase();
    const l = live.find((r) => (r.employeeId ?? "").toUpperCase() === id);
    const a = archRows.find((r) => (r.employeeId ?? "").toUpperCase() === id);
    const recs = exits.filter((e) => (e.employeeId ?? "").toUpperCase() === id && id).map((e) => e.rawData as Record<string, unknown>);
    const hist = log.filter((x) => x.filename.toUpperCase().startsWith(id + ":")).map((x) => `${x.uploadedAt.toISOString().slice(0, 10)} ${x.filename.slice(id.length + 1).trim()}`);
    const signs = [
      l?.classification === "payroll_converted" ? "live classification payroll_converted" : "",
      a?.classification === "payroll_converted" ? "archive classification payroll_converted" : "",
      hist.some((h) => h.includes("payroll_converted")) ? "Employee Status was Payroll Converted at some point" : "",
      l?.manualExitDate ? `typed date ${l.manualExitDate}` : "",
      l && !l.inDarwin && l.inTeachos ? "TeachOS only now" : "",
      l?.convertedUniversityName ? `converted university "${l.convertedUniversityName}"` : "",
    ].filter(Boolean);
    if (signs.length) suspects++;
    console.log(`${id || "(no id)"} | ${signs.length ? "PAYROLL SIGNS: " + signs.join("; ") : "no payroll signs"}`);
    console.log(`     Employee Status now ${l?.exitVerification ?? "(empty)"} | in Darwin ${l?.inDarwin ?? "-"} | in TeachOS ${l?.inTeachos ?? "-"} | archive date of exit ${p.date_of_exit ?? "-"} | exit raised ${p.exit_date ?? "-"}`);
    for (const r of recs) console.log(`     Darwin exit: ${r["Status"] ?? "-"} | Exit Date ${r["Exit Date"] ?? "-"} | Date Of Exit ${r["Date Of Exit"] ?? "-"} | Reason ${r["Reason For Leaving"] ?? r["Exit Reason"] ?? r["Separation Reason"] ?? "-"}`);
    for (const h of hist) console.log(`     log ${h}`);
  }
  console.log(`\nWith some sign of being payroll: ${suspects} of ${nxt.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
