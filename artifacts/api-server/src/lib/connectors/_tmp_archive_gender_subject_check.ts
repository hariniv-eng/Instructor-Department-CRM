// One-off, READ-ONLY (2026-10-13): how complete are Gender and Subject in the Instructor Archive? Counts archive rows that
// have each value (Darwin, exit-record or manual gender; computed or manual subject), split by payroll-converted vs others,
// and lists the people still missing one. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_archive_gender_subject_check.ts
import { db, instructorArchiveTable } from "@workspace/db";

async function main() {
  const rows = (await db.select().from(instructorArchiveTable)).filter((r) => r.inArchiveScope);
  const gender = (r: (typeof rows)[number]) => r.gender || r.exitGender || r.manualGender || null;
  const subject = (r: (typeof rows)[number]) => r.deptArea || r.manualDeptArea || null;
  const groups: Record<string, typeof rows> = { "payroll converted (not in Darwin)": rows.filter((r) => r.classification === "payroll_converted"), "everyone else": rows.filter((r) => r.classification !== "payroll_converted") };
  console.log(`Archive rows in scope: ${rows.length}\n`);
  for (const [name, list] of Object.entries(groups)) {
    const noG = list.filter((r) => !gender(r));
    const noS = list.filter((r) => !subject(r));
    console.log(`${name}: ${list.length} people | gender on file: ${list.length - noG.length} | subject on file: ${list.length - noS.length}`);
    if (noG.length) console.log(`   missing gender (${noG.length}): ${noG.slice(0, 25).map((r) => `${r.fullName} (${r.employeeId ?? "-"})`).join(", ")}${noG.length > 25 ? " ..." : ""}`);
    if (noS.length) console.log(`   missing subject (${noS.length}): ${noS.slice(0, 25).map((r) => `${r.fullName} (${r.employeeId ?? "-"})`).join(", ")}${noS.length > 25 ? " ..." : ""}`);
    console.log("");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
