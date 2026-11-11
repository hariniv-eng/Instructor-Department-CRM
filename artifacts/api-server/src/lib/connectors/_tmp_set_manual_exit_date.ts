// One-off REPAIR (2026-11-11, per request: NW0004547's manual date of exit was typed as 31 Oct 2025 by mistake; it is 31 Oct 2026. She is
// no longer in Darwin / TeachOS, so the page cannot edit it). Sets the manual date of exit (the one typed in for payroll instructors) for
// one employee ID, exactly as the page's date box would, and writes the change to the change log ("Employee Status change" uploads,
// like page edits). DRY RUN by default -- shows the current value; add --apply to write. Prints IDs and dates only.
//   pnpm exec tsx src/lib/connectors/_tmp_set_manual_exit_date.ts NW0004547 2026-10-31
//   pnpm exec tsx src/lib/connectors/_tmp_set_manual_exit_date.ts NW0004547 2026-10-31 --apply
import { sql } from "drizzle-orm";
import { db, instructorsTable, uploadsTable } from "@workspace/db";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const apply = args.includes("--apply");
  const [emp, date] = args.filter((a) => a !== "--apply").map((a) => a.trim());
  if (!emp || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) { console.log("usage: <employee id> <YYYY-MM-DD> [--apply]"); process.exit(1); }
  const id = emp.toUpperCase();
  const rows = await db.select().from(instructorsTable).where(sql`UPPER(TRIM(${instructorsTable.employeeId})) = ${id}`);
  if (rows.length !== 1) { console.log(`${id}: ${rows.length} rows found -- nothing changed.`); process.exit(0); }
  const r = rows[0];
  console.log(`${id} (row ${r.id}): manual date of exit now ${r.manualExitDate ?? "(none)"} -> ${date} | in TeachOS ${r.inTeachos} | in Darwin ${r.inDarwin} | Employee Status ${r.exitVerification ?? "(empty)"}`);
  if (!apply) { console.log("Dry run -- nothing written. Add --apply to save it."); process.exit(0); }
  await db.update(instructorsTable).set({ manualExitDate: date }).where(sql`${instructorsTable.id} = ${r.id}`);
  await db.insert(uploadsTable).values({ source: "Employee Status change", filename: `${id}: manual date of exit ${r.manualExitDate ?? "(none)"} -> ${date} (fixed by script, per request)`, rowCount: 0 });
  console.log("Saved.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
