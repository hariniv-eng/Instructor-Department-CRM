// One-off, READ-ONLY (2026-10-14): shows the Employee Status (Capability Manager's exit verification) and related fields for the
// six exit-pending people, from the live instructor register AND the permanent archive. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_six_status_check.ts
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";

const IDS = ["NW2000431", "NW2000614", "NW2000680", "NW2000681", "NW2000757", "NW0004728"];
const LABEL: Record<string, string> = { exited: "Exited", serving_notice_period: "Serving notice period", payroll_converted: "Payroll converted", absconded: "Absconded" };

async function main() {
  const live = await db.select().from(instructorsTable);
  const archive = await db.select().from(instructorArchiveTable);
  for (const id of IDS) {
    const l = live.find((r) => r.employeeId === id);
    const a = archive.find((r) => r.employeeId === id);
    console.log(`\n${id}  ${l?.fullName ?? a?.fullName ?? "(not found)"}`);
    if (l) console.log(`  LIVE    : in Darwin ${l.inDarwin} | in TeachOS ${l.inTeachos} | classification ${l.classification ?? "-"} | computed ${l.computedStatus} | manual status ${l.manualStatus ?? "-"} | EMPLOYEE STATUS (exit verification) ${l.exitVerification ? LABEL[l.exitVerification] ?? l.exitVerification : "not set"} | manual exit date ${l.manualExitDate ?? "-"} | exit flag ${l.exitFlag} / ${l.exitFlagStatus ?? "-"} / request ${l.exitFlagDate ?? "-"} / last day ${l.exitLastWorkingDate ?? "-"}`);
    else console.log("  LIVE    : no row in the live instructor register");
    if (a) console.log(`  ARCHIVE : computed ${a.computedStatus} | manual status ${a.manualStatus ?? "-"} | EMPLOYEE STATUS ${a.exitVerification ? LABEL[a.exitVerification] ?? a.exitVerification : "not set"} | exit date ${a.exitDate ?? "-"} | exit flag ${a.exitFlag} / ${a.exitFlagStatus ?? "-"} / ${a.exitFlagDate ?? "-"}`);
    else console.log("  ARCHIVE : no archive row");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
