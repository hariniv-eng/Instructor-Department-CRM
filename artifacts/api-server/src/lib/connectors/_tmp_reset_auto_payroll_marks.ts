// One-off (2026-10-12), DRY-RUN BY DEFAULT. Strict exit flow: anyone with a raised Darwin exit record (Approved / Pending)
// who is still in Darwin or TeachOS must first appear in Exception 1 (CM actions). Payroll-converted instructors had been
// auto-marked Employee Status = payroll_converted even with an exit record, so they never reached that list.
// This clears that mark (sets it to null) for those people only: classification payroll_converted + exit record on file.
// It also LISTS (never changes) people of other classifications carrying a payroll_converted mark with an exit record,
// since those may be genuine Capability Manager reviews.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_reset_auto_payroll_marks.ts            (preview only)
//   pnpm exec tsx src/lib/connectors/_tmp_reset_auto_payroll_marks.ts --apply    (writes)
import { db, instructorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const status = (s: string | null) => (s ?? "").trim().toLowerCase();

async function main() {
  const rows = await db.select().from(instructorsTable);
  const marked = rows.filter((r) => r.exitFlag && (r.inDarwin || r.inTeachos) && (status(r.exitFlagStatus) === "approved" || status(r.exitFlagStatus).startsWith("pending")) && r.exitVerification === "payroll_converted");
  const toReset = marked.filter((r) => r.classification === "payroll_converted");
  const leaveAlone = marked.filter((r) => r.classification !== "payroll_converted");
  const show = (label: string, list: typeof rows) => {
    console.log(`\n${label} (${list.length})`);
    for (const r of list) console.log([r.fullName, r.employeeId, r.classification, `exit: ${r.exitFlagStatus}`, `date: ${r.exitFlagDate ?? r.exitLastWorkingDate ?? ""}`, `darwin:${r.inDarwin}`, `teachos:${r.inTeachos}`].join("\t"));
  };
  show("Will be cleared -> they move to Exception 1 (CM actions)", toReset);
  show("Left untouched (other classification, may be a real CM review)", leaveAlone);
  if (!APPLY) { console.log("\nPREVIEW ONLY -- nothing written. Re-run with --apply to clear the first list."); process.exit(0); }
  for (const r of toReset) await db.update(instructorsTable).set({ exitVerification: null }).where(eq(instructorsTable.id, r.id));
  console.log(`\nCleared exit_verification for ${toReset.length} people. Run the data sync so the archive mirror updates.`);
  process.exit(0);
}
main().catch((error) => { console.error(error); process.exit(1); });
