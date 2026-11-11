// One-off (2026-11-11, per request). Undoes the sync's automatic Serving Notice Period -> Exited change for people it moved ONLY
// because of the "Lwd As Per Notice Period" backup date (removed today): their exit is still Pending With Approver, Darwin has no
// "Date Of Exit", no date was typed in FCC, Employee Status is still the sync's "exited", and no Capability Manager changed it after
// the sync did. Sets them back to Serving Notice Period and logs it like any Employee Status change. Employee IDs only.
//   pnpm exec tsx src/lib/connectors/_tmp_undo_lwd_auto_exit.ts            (dry run: lists who would change)
//   pnpm exec tsx src/lib/connectors/_tmp_undo_lwd_auto_exit.ts --apply    (makes the change)
import { sql, eq } from "drizzle-orm";
import { db, instructorsTable, darwinboxExitsTable, uploadsTable } from "@workspace/db";

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await db.select().from(instructorsTable);
  const exits = await db.select().from(darwinboxExitsTable);
  const log = await db.select().from(uploadsTable).where(sql`${uploadsTable.source} = 'Employee Status change'`);
  const todo: typeof rows = [];
  for (const r of rows) {
    const id = (r.employeeId ?? "").trim().toUpperCase();
    if (!id || r.exitVerification !== "exited" || r.manualExitDate) continue;
    if (!(r.exitFlagStatus ?? "").toLowerCase().startsWith("pending")) continue;
    const mine = log.filter((l) => l.filename.toUpperCase().startsWith(id + ":")).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
    if (!mine.length || !mine[0].filename.includes("exited by the SYNC")) continue; // latest change must be the sync's own
    const hasDate = exits.some((e) => (e.employeeId ?? "").trim().toUpperCase() === id && String((e.rawData as Record<string, unknown>)["Date Of Exit"] ?? "").trim() !== "");
    if (hasDate) continue;
    todo.push(r);
  }
  console.log(`${apply ? "Setting back" : "Would set back"} to Serving Notice Period: ${todo.length} -> ${todo.map((r) => r.employeeId).join(", ")}`);
  if (apply && todo.length) {
    for (const r of todo) await db.update(instructorsTable).set({ exitVerification: "serving_notice_period" }).where(eq(instructorsTable.id, r.id));
    await db.insert(uploadsTable).values(todo.map((r) => ({ source: "Employee Status change", filename: `${r.employeeId}: exited -> serving_notice_period (undo of the sync's auto-exit; that date was the Lwd backup, exit still pending, 2026-11-11)`, rowCount: 0 })));
    console.log("Done. Publish + Sync Now (if not done yet) so the lists use Darwin's Date Of Exit only.");
  } else if (!apply) console.log("Dry run only. Add --apply to make the change.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
