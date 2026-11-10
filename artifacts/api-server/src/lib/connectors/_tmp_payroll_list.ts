// One-off, READ-ONLY (2026-11-10, per request: "list of all payroll converted instructors -- the ones marked Payroll Converted in
// Employee Status by the Capability Managers"). Writes payroll_converted.csv in this folder -- it HAS STAFF NAMES: download it, then
// delete it from Replit (rm payroll_converted.csv). The console shows counts only.
//   Marked by CM   = Employee Status saved as "Payroll Converted" (exit_verification = payroll_converted).
//   Shown by default = a TeachOS-only payroll person with no exit record and nothing saved: the Instructors tab shows "Payroll
//                      Converted" for them, but no one has marked it. Listed separately in the same file.
//   pnpm exec tsx src/lib/connectors/_tmp_payroll_list.ts
import fs from "node:fs";
import { db, instructorsTable, instructorContributionTable, instructorManualJoiningTable } from "@workspace/db";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { isPayrollPerson } from "../../routes/reports";

const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;

async function main() {
  const all = await db.select().from(instructorsTable);
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [c.instructorUserId, c]));
  const manualJoin = new Map((await db.select().from(instructorManualJoiningTable)).map((m) => [m.employeeId, m.dateOfJoining]));
  // 2026-11-10 fix: 609 rows carry a saved "payroll_converted" Employee Status, 544 of them people who are in Darwin with no exit record --
  // old automatic defaults from before 2026-10-24 that no one sees (the dropdown is only shown for exit-record or payroll people). The
  // real payroll list is the app's own rule (isPayrollPerson, the Instructors tab's Payroll flag): TeachOS-only (payroll_converted
  // classification) OR a Darwin exit record that a Capability Manager marked Payroll Converted.
  const stale = all.filter((r) => r.exitVerification === "payroll_converted" && !isPayrollPerson(r));
  const marked = all.filter((r) => isPayrollPerson(r) && (r.inTeachos || r.inDarwin));
  const byDefault = all.filter((r) => !r.exitVerification && r.classification === "payroll_converted" && !r.exitFlag && (r.inTeachos || r.inDarwin));
  // Only the three columns asked for (2026-11-10, per request: "just employee ID, name, campus"), Capability-Manager-marked people only.
  const header = ["Employee ID", "Name", "Campus"];
  const row = (r: (typeof all)[number]) => [r.employeeId ?? "", r.fullName, (r.institutes ?? []).join("; ")].map(esc).join(",");
  const lines = [header.map(esc).join(","), ...marked.sort((a, b) => a.fullName.localeCompare(b.fullName)).map(row)];
  fs.writeFileSync("payroll_converted.csv", "﻿" + lines.join("\r\n"));
  const count = (rows: typeof all, f: (r: (typeof all)[number]) => boolean) => rows.filter(f).length;
  console.log(`PAYROLL CONVERTED (app rule, still in TeachOS or Darwin): ${marked.length}`);
  console.log(`   TeachOS-only payroll instructors ${count(marked, (r) => r.classification === "payroll_converted")} | Darwin exit record marked Payroll Converted by a CM ${count(marked, (r) => r.classification !== "payroll_converted")}`);
  console.log(`Ignored: ${stale.length} rows with an old saved "Payroll Converted" that the app does not treat as payroll (in Darwin, no exit record)`);
  console.log(`   still in TeachOS ${count(marked, (r) => r.inTeachos)} | in Darwin ${count(marked, (r) => r.inDarwin)} | in neither ${count(marked, (r) => !r.inTeachos && !r.inDarwin)} | with a Darwin exit record ${count(marked, (r) => r.exitFlag)}`);
  console.log(`Shown as Payroll Converted by default (TeachOS-only, no exit record, nobody marked it): ${byDefault.length}`);
  console.log(`Wrote payroll_converted.csv (HAS STAFF NAMES -- download it, then: rm payroll_converted.csv)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
