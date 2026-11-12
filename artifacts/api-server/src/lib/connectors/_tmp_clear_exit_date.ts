// One-off (2026-11-12, per request: NW2000736's typed date of exit 2026-01-22 is wrong -- Darwin has no Date Of Exit for him; it was
// typed while he was briefly shown as payroll). Clears the date typed in FCC for the employee IDs given on the command line and logs
// it as a "Date of exit change". Darwin's own data is not touched.
//   pnpm exec tsx src/lib/connectors/_tmp_clear_exit_date.ts NW2000736            (dry run: shows the current typed date)
//   pnpm exec tsx src/lib/connectors/_tmp_clear_exit_date.ts NW2000736 --apply    (clears it)
import { sql, eq } from "drizzle-orm";
import { db, instructorsTable, uploadsTable } from "@workspace/db";

async function main() {
  const apply = process.argv.includes("--apply");
  const ids = process.argv.slice(2).filter((a) => /^NW\d{7}$/i.test(a)).map((a) => a.toUpperCase());
  if (!ids.length) { console.log("usage: _tmp_clear_exit_date.ts NW0000000 [--apply]"); process.exit(1); }
  for (const id of ids) {
    const rows = await db.select().from(instructorsTable).where(sql`UPPER(TRIM(${instructorsTable.employeeId})) = ${id}`);
    if (!rows.length) { console.log(`${id}: not found`); continue; }
    for (const r of rows) {
      console.log(`${id} (row ${r.id}): typed date of exit ${r.manualExitDate ?? "(none)"}`);
      if (!r.manualExitDate) continue;
      if (apply) {
        await db.update(instructorsTable).set({ manualExitDate: null }).where(eq(instructorsTable.id, r.id));
        await db.insert(uploadsTable).values({ source: "Date of exit change", filename: `${id}: ${r.manualExitDate} -> (empty) (wrong typed date cleared, 2026-11-12)`, rowCount: 0 });
        console.log(`   cleared`);
      }
    }
  }
  if (!apply) console.log("Dry run only. Add --apply to clear.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
