// One-off, READ-ONLY (2026-11-09, per request: "some exits show 'Raised 24 Oct' -- if they have exited they surely have a date of exit;
// get that date, not the raised date"). FCC reads the last working day ONLY from the exit record's "Date Of Exit" field. This looks for
// the date under any other name, for the approved exits that have no "Date Of Exit":
//   1. every field of their Darwin exit record(s) whose name looks like a date / notice / relieving / separation field, with its value
//   2. the same for their row in Darwin's full employee roster (exited people may still be listed there with a last working day)
//   3. a count of how often each such field is filled across ALL stored exit records
// Prints employee IDs, field names and dates only -- no names.
//   pnpm exec tsx src/lib/connectors/_tmp_exit_date_fields.ts
import { sql } from "drizzle-orm";
import { db, darwinboxExitsTable, darwinboxFullRosterTable } from "@workspace/db";
import { loadArchivePeople } from "../../routes/reports";

const DATEISH = /date|day|relie|separat|notice|last|lwd|exit|resign|leav/i;
const show = (raw: Record<string, unknown>) => Object.entries(raw).filter(([k, v]) => DATEISH.test(k) && v !== null && v !== undefined && String(v).trim() !== "")
  .map(([k, v]) => `${k} = ${String(v).slice(0, 40)}`).join(" | ");

async function main() {
  const people = (await loadArchivePeople()) as Array<Record<string, unknown>>;
  const missing = people.filter((p) => p.status === "Exited" && String(p.exit_status ?? "").trim().toLowerCase() === "approved" && !p.is_payroll && !p.date_of_exit && p.employee_id);
  console.log(`Approved exits on the Exit data card with NO Date of Exit: ${missing.length}\n`);
  for (const p of missing) {
    const id = String(p.employee_id).trim().toUpperCase();
    console.log(`${id} (raised ${p.exit_date ?? "-"})`);
    const exits = await db.select().from(darwinboxExitsTable).where(sql`UPPER(TRIM(${darwinboxExitsTable.employeeId})) = ${id}`);
    for (const x of exits) console.log(`   exit record ${x.id}: ${show(x.rawData as Record<string, unknown>) || "(no date-like fields filled)"}`);
    const roster = await db.select().from(darwinboxFullRosterTable).where(sql`UPPER(TRIM(${darwinboxFullRosterTable.employeeId})) = ${id}`);
    for (const r of roster) console.log(`   full roster: ${show(r.rawData as Record<string, unknown>) || "(no date-like fields filled)"}`);
    if (!roster.length) console.log(`   full roster: not listed`);
  }

  const all = await db.select().from(darwinboxExitsTable);
  const filled = new Map<string, number>();
  for (const x of all) for (const [k, v] of Object.entries(x.rawData as Record<string, unknown>))
    if (DATEISH.test(k) && v !== null && v !== undefined && String(v).trim() !== "") filled.set(k, (filled.get(k) ?? 0) + 1);
  console.log(`\nDate-like fields across all ${all.length} stored exit records (field: records with a value):`);
  for (const [k, v] of [...filled].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
