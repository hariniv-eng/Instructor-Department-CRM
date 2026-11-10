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

const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;

async function main() {
  const all = await db.select().from(instructorsTable);
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [c.instructorUserId, c]));
  const manualJoin = new Map((await db.select().from(instructorManualJoiningTable)).map((m) => [m.employeeId, m.dateOfJoining]));
  const marked = all.filter((r) => r.exitVerification === "payroll_converted");
  const byDefault = all.filter((r) => !r.exitVerification && r.classification === "payroll_converted" && !r.exitFlag && (r.inTeachos || r.inDarwin));
  // Only the three columns asked for (2026-11-10, per request: "just employee ID, name, campus"), Capability-Manager-marked people only.
  const header = ["Employee ID", "Name", "Campus"];
  const row = (r: (typeof all)[number]) => [r.employeeId ?? "", r.fullName, (r.institutes ?? []).join("; ")].map(esc).join(",");
  const lines = [header.map(esc).join(","), ...marked.sort((a, b) => a.fullName.localeCompare(b.fullName)).map(row)];
  fs.writeFileSync("payroll_converted.csv", "﻿" + lines.join("\r\n"));
  const count = (rows: typeof all, f: (r: (typeof all)[number]) => boolean) => rows.filter(f).length;
  console.log(`Marked Payroll Converted by a Capability Manager: ${marked.length}`);
  console.log(`   still in TeachOS ${count(marked, (r) => r.inTeachos)} | in Darwin ${count(marked, (r) => r.inDarwin)} | in neither ${count(marked, (r) => !r.inTeachos && !r.inDarwin)} | with a Darwin exit record ${count(marked, (r) => r.exitFlag)}`);
  console.log(`Shown as Payroll Converted by default (TeachOS-only, no exit record, nobody marked it): ${byDefault.length}`);
  console.log(`Wrote payroll_converted.csv (HAS STAFF NAMES -- download it, then: rm payroll_converted.csv)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
