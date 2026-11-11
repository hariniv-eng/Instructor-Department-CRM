// One-off, READ-ONLY (2026-11-11, per request: "from the payroll instructors, the ones whose exit data is not recorded"). Payroll =
// the app's rule (isPayrollPerson, the Instructors tab's Payroll flag), still in TeachOS or Darwin. Lists those with NO Darwin exit record.
// Writes payroll_no_exit.csv (Employee ID, Name, Campus, Subject, Capability Manager) -- HAS STAFF NAMES: download it, then
// rm payroll_no_exit.csv. The console shows counts only.
//   pnpm exec tsx src/lib/connectors/_tmp_payroll_no_exit.ts
import fs from "node:fs";
import { db, instructorsTable } from "@workspace/db";
import { isPayrollPerson } from "../../routes/reports";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;

async function main() {
  const payroll = (await db.select().from(instructorsTable)).filter((r) => isPayrollPerson(r) && (r.inTeachos || r.inDarwin));
  const noExit = payroll.filter((r) => !r.exitFlag).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const lines = [["Employee ID", "Name", "Campus", "Subject", "Capability Manager"].map(esc).join(","),
    ...noExit.map((r) => [r.employeeId ?? "", r.fullName, (r.institutes ?? []).join("; "), normalizeSubjectArea(r.deptArea || r.manualDeptArea || null) ?? "",
      r.teachosManager || r.manualCapabilityManager || ""].map(esc).join(","))];
  fs.writeFileSync("payroll_no_exit.csv", "﻿" + lines.join("\r\n"));
  const byCampus = new Map<string, number>();
  for (const r of noExit) { const c = (r.institutes ?? [])[0] ?? "(no campus)"; byCampus.set(c, (byCampus.get(c) ?? 0) + 1); }
  console.log(`Payroll instructors: ${payroll.length} | with a Darwin exit record ${payroll.length - noExit.length} | WITHOUT any exit record ${noExit.length}`);
  for (const [c, n] of [...byCampus].sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`);
  console.log("Wrote payroll_no_exit.csv (HAS STAFF NAMES -- download it, then: rm payroll_no_exit.csv)");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
