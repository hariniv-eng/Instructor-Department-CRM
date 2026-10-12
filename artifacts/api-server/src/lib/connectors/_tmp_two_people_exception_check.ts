// One-off, READ-ONLY diagnostic (2026-10-12): why were NW0007637 (Shubham Sharma), NW0007464 (Akarsh Jain), NW0006757 (Ayush Khandal) and NW0005043 (Tamkheen Fazliyat)
// never on the Exception list (CM actions)? Prints each person's live row flags and tests them against every
// condition of the exception queue rule in reports.ts (exceptionQueueRows), plus their raw exit records.
// Run from artifacts/api-server:  pnpm exec tsx --env-file=.env src/lib/connectors/_tmp_two_people_exception_check.ts
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const NOT_DEPARTMENT = new Set(["excluded_other_department", "excluded_non_department_team", "iit_kharagpur_team", "other_department_manual"]);
const IDS = ["NW0007637", "NW0007464", "NW0006757", "NW0005043"];

async function main() {
  for (const id of IDS) {
    console.log(`\n===== ${id} =====`);
    const [live] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, id));
    if (!live) console.log("NOT in instructorsTable (live) -- so the Exception queue (built from it) can never include them.");
    else {
      const status = (live.exitFlagStatus ?? "").trim().toLowerCase();
      const checks = {
        "exitFlag": !!live.exitFlag,
        "inDarwin || inTeachos": !!(live.inDarwin || live.inTeachos),
        "exit status Approved/Pending": status === "approved" || status.startsWith("pending"),
        "not marked payroll_converted": live.exitVerification !== "payroll_converted",
        "not filed under another team": !NOT_DEPARTMENT.has(live.classification ?? ""),
      };
      console.log({
        fullName: live.fullName, inDarwin: live.inDarwin, inDarwinFullRoster: live.inDarwinFullRoster, inTeachos: live.inTeachos,
        classification: live.classification, deptBucket: live.deptBucket, exitFlag: live.exitFlag, exitFlagStatus: live.exitFlagStatus,
        exitFlagDate: live.exitFlagDate, exitLastWorkingDate: live.exitLastWorkingDate, exitVerification: live.exitVerification,
        teachosManager: live.teachosManager, manualCapabilityManager: live.manualCapabilityManager, darwinEmployeeStatus: live.darwinEmployeeStatus,
      });
      console.log("Exception-queue conditions:", checks);
      console.log("In Exception queue:", Object.values(checks).every(Boolean), "| in 'Needs review' (no exitVerification):", Object.values(checks).every(Boolean) && !live.exitVerification);
    }
    const [archive] = await db.select().from(instructorArchiveTable).where(eq(instructorArchiveTable.employeeId, id));
    console.log("Archive row:", archive ? { inArchiveScope: archive.inArchiveScope, inDarwin: archive.inDarwin, inTeachos: archive.inTeachos, classification: archive.classification, firstSeenAt: archive.firstSeenAt } : "none");
    const exits = (await db.select().from(darwinboxExitsTable)).filter((row) => row.employeeId === id);
    console.log(`Exit records: ${exits.length}`);
    for (const exit of exits) {
      const raw = exit.rawData as Record<string, unknown>;
      console.log({ id: exit.id, Status: raw["Status"], "Exit Date": raw["Exit Date"], "Date Of Exit": raw["Date Of Exit"] });
    }
  }
  process.exit(0);
}
main().catch((error) => { console.error(error); process.exit(1); });
