// One-off (2026-10-24, per request: "Employee Status should NOT become Payroll Converted automatically -- only people with an exit record
// get the manual Employee Status, and the Capability Manager marks them Payroll Converted"). READ-ONLY by default. Shows:
//   * the last Darwin syncs (row counts) -- a Darwin sync that returned few people made almost everyone look "TeachOS only", and the
//     old automatic rule then filled in Payroll Converted for all of them;
//   * everyone whose Employee Status is Payroll Converted, split into: has an exit record on file (kept -- a CM's decision) / has NO exit
//     record at all (the automatic mark -- to be cleared).
// With --apply it CLEARS Employee Status (back to empty) for everyone marked Payroll Converted who has NO exit record of any status in
// the Darwin exit data -- live table and Instructor Archive. People with an exit record keep their CM's choice.
//   pnpm exec tsx src/lib/connectors/_tmp_payroll_mark_check.ts
//   pnpm exec tsx src/lib/connectors/_tmp_payroll_mark_check.ts --apply
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, instructorsTable, instructorArchiveTable, uploadsTable, darwinboxExitsTable } from "@workspace/db";

async function main() {
  const apply = process.argv.includes("--apply");
  const darwinRuns = await db.select().from(uploadsTable).where(eq(uploadsTable.source, "Darwin")).orderBy(desc(uploadsTable.uploadedAt)).limit(8);
  console.log("Last Darwin syncs (a much smaller number than usual = Darwin returned too few people):");
  for (const u of darwinRuns) console.log(`  ${u.uploadedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST | ${u.rowCount} rows`);
  const withExit = new Set((await db.select({ e: darwinboxExitsTable.employeeId }).from(darwinboxExitsTable)).map((r) => (r.e ?? "").toUpperCase()).filter(Boolean));
  const people = await db.select().from(instructorsTable);
  const pc = people.filter((p) => p.exitVerification === "payroll_converted");
  const keep = pc.filter((p) => p.employeeId && withExit.has(p.employeeId.toUpperCase()));
  const clear = pc.filter((p) => !(p.employeeId && withExit.has(p.employeeId.toUpperCase())));
  console.log(`\nPeople: ${people.length} | in Darwin now: ${people.filter((p) => p.inDarwin).length} | Employee Status = Payroll Converted: ${pc.length}`);
  console.log(`  ${keep.length} have an exit record on file -> KEPT (Capability Manager's decision)`);
  console.log(`  ${clear.length} have NO exit record -> automatic mark, to be CLEARED`);
  for (const p of clear.slice(0, 30)) console.log(`     ${p.fullName} | ${p.employeeId ?? "-"} | in Darwin: ${p.inDarwin ? "yes" : "no"} | ${p.classification ?? "-"}`);
  if (clear.length > 30) console.log(`     ... and ${clear.length - 30} more`);
  const archiveRows = await db.select({ id: instructorArchiveTable.id, emp: instructorArchiveTable.employeeId }).from(instructorArchiveTable).where(eq(instructorArchiveTable.exitVerification, "payroll_converted"));
  const archiveClear = archiveRows.filter((a) => !(a.emp && withExit.has(a.emp.toUpperCase())));
  console.log(`Instructor Archive rows marked Payroll Converted with no exit record: ${archiveClear.length}`);
  if (!apply) { console.log("\nNothing changed. Run again with --apply to clear these."); process.exit(0); }
  if (clear.length) await db.update(instructorsTable).set({ exitVerification: null }).where(inArray(instructorsTable.id, clear.map((p) => p.id)));
  if (archiveClear.length) await db.update(instructorArchiveTable).set({ exitVerification: null }).where(and(inArray(instructorArchiveTable.id, archiveClear.map((a) => a.id)), eq(instructorArchiveTable.exitVerification, "payroll_converted")));
  console.log(`\nCleared Employee Status for ${clear.length} live records and ${archiveClear.length} Archive rows.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
