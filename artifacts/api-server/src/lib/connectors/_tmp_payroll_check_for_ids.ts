// One-off, READ-ONLY (2026-10-13): for the 35 employee IDs on the "Exit dates" list, how many are payroll converted?
// Two meanings are shown side by side: (1) classification = payroll_converted (a payroll instructor: in TeachOS, no Darwin
// record) and (2) Employee Status (exit_verification) = payroll_converted. Looks in the live instructors table first and
// falls back to the archive table. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_payroll_check_for_ids.ts
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";

const IDS = "NW0001780, NW0003443, NW0003537, NW0003927, NW0003935, NW0004042, NW0004728, NW0005043, NW0005549, NW0005733, NW0006757, NW0006883, NW0007018, NW2000299, NW2000339, NW2000377, NW2000393, NW2000442, NW2000516, NW2000538, NW2000560, NW2000575, NW2000604, NW2000632, NW2000642, NW2000646, NW2000654, NW2000656, NW2000668, NW2000678, NW2000683, NW2000690, NW2000697, NW2000719, NW2000721".split(",").map((id) => id.trim());

async function main() {
  const live = await db.select().from(instructorsTable);
  const archive = await db.select().from(instructorArchiveTable);
  const lines = [["name", "employee_id", "found_in", "classification", "employee_status_(exit_verification)", "in_darwin", "in_teachos", "payroll_converted_by_classification", "marked_payroll_converted_in_status"]];
  let byClass = 0, byStatus = 0, either = 0, missing = 0;
  for (const id of IDS) {
    const liveRow = live.find((row) => row.employeeId === id);
    const archiveRow = archive.find((row) => row.employeeId === id);
    const row = liveRow ?? archiveRow;
    if (!row) { lines.push(["", id, "NOT FOUND", "", "", "", "", "", ""]); missing += 1; continue; }
    const isClass = row.classification === "payroll_converted";
    const isStatus = row.exitVerification === "payroll_converted";
    if (isClass) byClass += 1;
    if (isStatus) byStatus += 1;
    if (isClass || isStatus) either += 1;
    lines.push([row.fullName, id, liveRow ? "live" : "archive only", row.classification ?? "", row.exitVerification ?? "", String(row.inDarwin), String(row.inTeachos), isClass ? "YES" : "no", isStatus ? "YES" : "no"]);
  }
  console.log(lines.map((line) => line.join("\t")).join("\n"));
  console.log(`\nOf ${IDS.length}: ${byClass} payroll converted by classification, ${byStatus} marked Payroll Converted in Employee Status, ${either} either, ${missing} not found.`);
  process.exit(0);
}
main().catch((error) => { console.error(error); process.exit(1); });
