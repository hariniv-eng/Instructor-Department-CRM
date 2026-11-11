// One-off, READ-ONLY (2026-11-11, per request: "pending-approval people are on Remove access with a date of exit the exit data does
// not have -- where did it come from?"). For everyone with a Darwin exit record still Pending With Approver, and for anyone whose
// name / employee ID is given on the command line: Darwin's "Date Of Exit", the "Lwd As Per Notice Period" (the backup that was
// used until today), the date typed in FCC, Employee Status, in TeachOS, and whether the sync auto-moved them Serving Notice -> Exited.
// Employee IDs only in the pending list; a searched person is shown by ID as well.
//   pnpm exec tsx src/lib/connectors/_tmp_exit_date_origin.ts            (pending list)
//   pnpm exec tsx src/lib/connectors/_tmp_exit_date_origin.ts "faris"    (plus one person)
import { sql } from "drizzle-orm";
import { db, instructorsTable, darwinboxExitsTable, uploadsTable } from "@workspace/db";

const cellOf = (raw: Record<string, unknown>, key: string) => { const v = raw[key]; return v == null || String(v).trim() === "" ? "-" : String(v).trim(); };

async function main() {
  const q = process.argv.slice(2).filter((a) => a !== "--").join(" ").trim();
  const rows = await db.select().from(instructorsTable);
  const exits = await db.select().from(darwinboxExitsTable);
  const autoLog = (await db.select().from(uploadsTable).where(sql`${uploadsTable.source} = 'Employee Status change' AND ${uploadsTable.filename} LIKE '%exited by the SYNC%'`));
  const show = (r: typeof rows[number]) => {
    const id = (r.employeeId ?? "").trim().toUpperCase();
    const recs = exits.filter((e) => (e.employeeId ?? "").trim().toUpperCase() === id && id);
    const auto = autoLog.filter((l) => l.filename.toUpperCase().startsWith(id + ":"));
    console.log(`${r.employeeId ?? "(no id)"} | Darwin exit status ${r.exitFlagStatus ?? "-"} | Employee Status ${r.exitVerification ?? "(empty)"} | in TeachOS ${r.inTeachos ? "yes" : "no"} | typed in FCC ${r.manualExitDate ?? "-"} | stored date of exit ${r.exitLastWorkingDate ?? "-"}`);
    for (const e of recs) { const raw = e.rawData as Record<string, unknown>; console.log(`     exit record: status ${cellOf(raw, "Status")} | Date Of Exit ${cellOf(raw, "Date Of Exit")} | Lwd As Per Notice Period ${cellOf(raw, "Lwd As Per Notice Period")} | Exit Date (request) ${cellOf(raw, "Exit Date")}`); }
    for (const l of auto) console.log(`     AUTO by sync ${l.uploadedAt.toISOString().slice(0, 10)}: ${l.filename.slice(id.length + 1).trim()}`);
  };
  if (q) {
    const isId = /^NW\d{7}$/i.test(q);
    const found = rows.filter((r) => isId ? (r.employeeId ?? "").toUpperCase() === q.toUpperCase() : r.fullName.toLowerCase().includes(q.toLowerCase()));
    console.log(`\n=== "${q}": ${found.length} row(s)`);
    found.forEach(show);
  }
  const pending = rows.filter((r) => r.exitFlag && (r.exitFlagStatus ?? "").toLowerCase().startsWith("pending") && (r.inDarwin || r.inTeachos));
  console.log(`\n=== Pending With Approver, still in Darwin or TeachOS: ${pending.length}`);
  pending.sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId))).forEach(show);
  const lwdOnly = pending.filter((r) => !r.manualExitDate && r.exitLastWorkingDate);
  console.log(`\nPending people whose stored date of exit can only have come from the Lwd backup (no typed date): ${lwdOnly.length} -> ${lwdOnly.map((r) => r.employeeId).join(", ")}`);
  console.log(`Auto-moved Serving Notice -> Exited by the sync (all time): ${autoLog.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
