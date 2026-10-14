// One-off, READ-ONLY (2026-10-14): finds payroll-converted people whose Darwin exit record is gone from darwinbox_exits but who
// still carry evidence in the permanent archive that they had one (an exit date, or exit department / designation). Run in the
// Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_lost_payroll_exits_check.ts
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable } from "@workspace/db";

async function main() {
  const exits = await db.select({ employeeId: darwinboxExitsTable.employeeId }).from(darwinboxExitsTable);
  const withExit = new Set(exits.map((e) => (e.employeeId ?? "").trim().toLowerCase()).filter(Boolean));
  const live = await db.select().from(instructorsTable);
  const archive = await db.select().from(instructorArchiveTable);
  const liveById = new Map(live.filter((r) => r.employeeId).map((r) => [r.employeeId!.toLowerCase(), r]));
  const rows: string[] = [];
  for (const a of archive) {
    const id = (a.employeeId ?? "").trim().toLowerCase();
    if (!id || withExit.has(id)) continue;
    const l = liveById.get(id);
    const evidence = !!(a.exitDate || a.exitFlagStatus || a.exitFlag || a.exitDepartment || a.exitDesignation);
    if (!evidence) continue;
    const payroll = (l?.classification ?? a.classification) === "payroll_converted" || (l?.exitVerification ?? a.exitVerification) === "payroll_converted";
    if (!payroll) continue;
    rows.push([a.fullName, a.employeeId, `archive exit date ${a.exitDate ?? "-"}`, `exit status ${a.exitFlagStatus ?? "-"}`, `exit dept ${a.exitDepartment ?? "-"}`, `exit desig ${a.exitDesignation ?? "-"}`, `live exitFlag ${l?.exitFlag ?? "n/a"}`, `verification ${l?.exitVerification ?? a.exitVerification ?? "-"}`].join(" | "));
  }
  console.log(`Payroll-converted people with archive exit evidence but NO row in darwinbox_exits: ${rows.length}`);
  rows.forEach((r) => console.log(r));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
