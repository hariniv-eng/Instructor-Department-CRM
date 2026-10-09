// One-off (2026-10-08): why do three non-tech payroll-converted instructors have no Subject?
// Prints TeachOS-side fields for them, and the distinct TeachOS categories across everyone
// (so we can see which category values the Subject fallback does not recognise). Read-only.
import { db, instructorsTable } from "@workspace/db";
import { classifyDepartment } from "../departmentTaxonomy";

const IDS = ["NW0004566", "NW0004558", "NW0004704"];

async function main() {
  const rows = await db.select().from(instructorsTable);
  console.log(`live rows: ${rows.length}\n`);
  for (const id of IDS) {
    const r = rows.find((x) => x.employeeId === id);
    console.log(`=== ${id} ===`);
    if (!r) { console.log("  NOT in live instructors table\n"); continue; }
    console.log(`  name=${r.fullName} class=${r.classification} inTeachos=${r.inTeachos} inDarwin=${r.inDarwin}`);
    console.log(`  teachosCategory=${JSON.stringify(r.teachosCategory)} teachosRole=${JSON.stringify(r.teachosRole)}`);
    console.log(`  enrolledPlans=${JSON.stringify(r.enrolledPlans)} institutes=${JSON.stringify(r.institutes)}`);
    console.log(`  deptBucket=${r.deptBucket} deptArea=${r.deptArea} manualDeptArea=${r.manualDeptArea}`);
    console.log(`  exitDepartment=${JSON.stringify(r.exitDepartment)} exitDesignation=${JSON.stringify(r.exitDesignation)}`);
    console.log(`  classifyDepartment(category) => ${JSON.stringify(classifyDepartment(null, r.teachosCategory))}\n`);
  }
  const counts = new Map<string, number>();
  const noArea = new Map<string, number>();
  for (const r of rows) {
    if (!r.inTeachos) continue;
    const k = JSON.stringify(r.teachosCategory);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (!r.deptArea && !r.manualDeptArea) noArea.set(k, (noArea.get(k) ?? 0) + 1);
  }
  console.log("TeachOS category values (all TeachOS rows):");
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}  (without a Subject: ${noArea.get(k) ?? 0})`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
