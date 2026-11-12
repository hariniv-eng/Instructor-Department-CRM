// One-off, READ-ONLY (2026-11-12, per request: "we have payroll converted instructors who exited -- why are they not in the Exit
// Breakdown?"). Lists every payroll person (the app's isPayrollPerson rule) whom a Capability Manager marked Exited / Absconded /
// Serving Notice Period, or whom the Instructor Archive marks Exited, with: Employee Status, Darwin exit record status, archive status,
// archive exit status, date of exit (archive), date typed in FCC. Employee IDs only.
//   pnpm exec tsx src/lib/connectors/_tmp_payroll_exits.ts
import { db, instructorsTable } from "@workspace/db";
import { isPayrollPerson, loadArchivePeople } from "../../routes/reports";

async function main() {
  const live = (await db.select().from(instructorsTable)).filter((r) => isPayrollPerson(r));
  const arch = await loadArchivePeople();
  const archBy = new Map(arch.map((a) => [String(a.employee_id ?? "").toUpperCase() || `T:${a.teachos_user_id}`, a]));
  const leaving = new Set(["exited", "absconded", "serving_notice_period"]);
  const ids = new Set<string>();
  for (const r of live) if (leaving.has(r.exitVerification ?? "")) ids.add(String(r.employeeId ?? "").toUpperCase() || `T:${r.teachosUserId}`);
  for (const a of arch) if (a.is_payroll && a.status === "Exited") ids.add(String(a.employee_id ?? "").toUpperCase() || `T:${a.teachos_user_id}`);
  console.log(`Payroll people marked leaving by a CM, or Exited in the archive: ${ids.size}\n`);
  console.log("employee id | Employee Status | Darwin exit record | archive status | archive exit status | archive date of exit | typed in FCC | in Exit Breakdown now?");
  for (const id of [...ids].sort()) {
    const r = live.find((x) => (String(x.employeeId ?? "").toUpperCase() || `T:${x.teachosUserId}`) === id);
    const a = archBy.get(id);
    const shown = !!a && a.status === "Exited" && (a.exit_status ?? "").trim().toLowerCase() === "approved";
    console.log(`${id} | ${r?.exitVerification ?? "-"} | ${r?.exitFlag ? r.exitFlagStatus : "none"} | ${a?.status ?? "not in archive"} | ${a?.exit_status ?? "-"} | ${a?.date_of_exit ?? "-"} | ${r?.manualExitDate ?? "-"} | ${shown ? "yes" : "NO"}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
