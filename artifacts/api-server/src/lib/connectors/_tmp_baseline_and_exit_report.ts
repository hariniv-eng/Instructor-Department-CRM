// One-off (2026-10-06): (1) take the Instructor Archive baseline -- marks
// everyone currently in the department (695) as inArchiveScope via
// archiveInstructors(); (2) report which of those have an exit record and
// export them to CSV (project tmp/ folder, git-ignored, plus Downloads).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db, instructorArchiveTable } from "@workspace/db";
import { archiveInstructors } from "../archiveInstructors";

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const result = await archiveInstructors();
  console.log("archiveInstructors:", result);

  const rows = await db.select().from(instructorArchiveTable);
  const inScope = rows.filter((r) => r.inArchiveScope);
  console.log(`Archive rows: ${rows.length} | baseline (in scope): ${inScope.length}`);

  const withExit = inScope.filter((r) => r.exitFlag || r.exitFlagDate || r.exitDate);
  const darwinExit = withExit.filter((r) => r.exitFlag || r.exitFlagDate);
  const manualOnly = withExit.filter((r) => !(r.exitFlag || r.exitFlagDate));
  console.log(`\nWith any exit record: ${withExit.length}`);
  console.log(`  from a Darwinbox exit record: ${darwinExit.length}`);
  console.log(`  manual exit date only (no Darwinbox record): ${manualOnly.length}`);

  const byStatus = new Map<string, number>();
  for (const r of darwinExit) byStatus.set(r.exitFlagStatus ?? "(blank)", (byStatus.get(r.exitFlagStatus ?? "(blank)") ?? 0) + 1);
  console.log("  Darwinbox exit status breakdown:", Object.fromEntries(byStatus));
  console.log(`  Still in Darwin today (notice period): ${withExit.filter((r) => r.inDarwin).length} | already gone from Darwin: ${withExit.filter((r) => !r.inDarwin).length}`);

  const header = ["Name", "Employee ID", "Designation", "Department", "Category", "Payroll", "Date of joining", "Exit date", "Exit date source", "Darwinbox exit status", "Manual status", "Exit verified", "Still in Darwin", "Still in TeachOS"];
  const lines = [header.join(",")];
  const sorted = [...withExit].sort((a, b) => String(b.exitFlagDate ?? b.exitDate ?? "").localeCompare(String(a.exitFlagDate ?? a.exitDate ?? "")));
  for (const r of sorted) {
    lines.push([
      r.fullName, r.employeeId, r.designation ?? r.exitDesignation, r.department ?? r.exitDepartment, r.deptBucket ?? r.classification,
      r.classification === "payroll_converted" ? "Payroll" : "Nxtwave", r.dateOfJoining,
      r.exitFlagDate ?? r.exitDate, r.exitFlagDate ? "Darwinbox exit record" : "Manual", r.exitFlagStatus, r.manualStatus, r.exitVerification,
      r.inDarwin ? "Yes" : "No", r.inTeachos ? "Yes" : "No",
    ].map(cell).join(","));
  }
  const name = "instructor_archive_exit_records.csv";
  const projectDir = path.resolve(process.cwd(), "tmp");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, name), lines.join("\n"), "utf8");
  fs.writeFileSync(path.join(os.homedir(), "Downloads", name), lines.join("\n"), "utf8");
  console.log(`\nSaved ${withExit.length} rows to tmp/${name} and Downloads/${name}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
