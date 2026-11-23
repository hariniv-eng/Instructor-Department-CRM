// One-off (2026-11-23, per request: NW2000671 is a real exit, but his Employee Status says Payroll Converted -- set before 9 Nov, before
// his Darwin exit was raised on 13 Nov -- and it cannot be changed on the page because he is in neither Darwin nor TeachOS any more, so
// he is not on the Instructors tab). Sets the Capability Manager's Employee Status (exit_verification) for the employee IDs given, on
// the live row AND the Instructor Archive row, exactly as the page would, and logs it as an "Employee Status change ... by script".
// Allowed values: exited, serving_notice_period, payroll_converted, absconded, clear. Dry run unless --apply.
//   pnpm exec tsx src/lib/connectors/_tmp_set_employee_status.ts NW2000671 exited            (dry run: shows the current value)
//   pnpm exec tsx src/lib/connectors/_tmp_set_employee_status.ts NW2000671 exited --apply    (sets it)
// --clear-archive-exit-date (2026-11-23, NW2000756): also empties the exit date STORED on his Instructor Archive row -- the Archive calls
// anyone with a stored date Exited, and the sync keeps that date forever (archiveInstructors keep()). Use only for someone still working
// with no Darwin exit record; a later real Darwin exit fills it again.
//   pnpm exec tsx src/lib/connectors/_tmp_set_employee_status.ts NW2000756 clear --clear-archive-exit-date [--apply]
import { sql } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable, uploadsTable } from "@workspace/db";

const VALUES = ["exited", "serving_notice_period", "payroll_converted", "absconded", "clear"];

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const clearDate = args.includes("--clear-archive-exit-date");
  const ids = args.filter((a) => /^NW\d{7}$/i.test(a)).map((a) => a.toUpperCase());
  const value = args.find((a) => VALUES.includes(a.toLowerCase()))?.toLowerCase();
  if (!ids.length || !value) { console.log(`usage: _tmp_set_employee_status.ts NW0000000 <${VALUES.join("|")}> [--apply]`); process.exit(1); }
  const next = value === "clear" ? null : value;
  for (const emp of ids) {
    const live = await db.select().from(instructorsTable).where(sql`UPPER(TRIM(${instructorsTable.employeeId})) = ${emp}`);
    const arch = await db.select().from(instructorArchiveTable).where(sql`UPPER(TRIM(${instructorArchiveTable.employeeId})) = ${emp}`);
    if (!live.length && !arch.length) { console.log(`${emp}: not found`); continue; }
    for (const r of live) console.log(`${emp} live row ${r.id}: ${r.exitVerification ?? "(empty)"} -> ${next ?? "(empty)"}`);
    for (const a of arch) console.log(`${emp} archive row ${a.id}: ${a.exitVerification ?? "(empty)"} -> ${next ?? "(empty)"}${clearDate ? ` | stored exit date ${a.exitDate ?? "(empty)"} -> (empty)` : ""}`);
    if (!apply) continue;
    await db.update(instructorsTable).set({ exitVerification: next }).where(sql`UPPER(TRIM(${instructorsTable.employeeId})) = ${emp}`);
    await db.update(instructorArchiveTable).set(clearDate ? { exitVerification: next, exitDate: null } : { exitVerification: next }).where(sql`UPPER(TRIM(${instructorArchiveTable.employeeId})) = ${emp}`);
    await db.insert(uploadsTable).values({ source: "Employee Status change", filename: `${emp}: ${live[0]?.exitVerification ?? arch[0]?.exitVerification ?? "(empty)"} -> ${next ?? "(empty)"} by script (per request, not on the Instructors tab)${clearDate ? "; archive exit date cleared" : ""}`, rowCount: 0 });
    console.log(`${emp}: saved and logged`);
  }
  if (!apply) console.log("\nDry run -- nothing changed. Add --apply to save.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
