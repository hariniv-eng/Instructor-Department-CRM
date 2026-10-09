// One-off (2026-10-08): the 3 non-tech people have classification=null even though they are TeachOS-only.
// Shows how widespread that is and what their computed status is. Read-only.
import { db, instructorsTable } from "@workspace/db";

async function main() {
  const rows = await db.select().from(instructorsTable);
  const key = (r: (typeof rows)[number]) => `class=${r.classification} computed=${r.computedStatus} inDarwin=${r.inDarwin} inTeachos=${r.inTeachos}`;
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
  console.log("Rows by classification / computed status / presence:");
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${k}`);
  console.log("\nTeachOS-only rows with NO classification:");
  for (const r of rows.filter((x) => x.inTeachos && !x.inDarwin && !x.classification))
    console.log(`  ${r.employeeId ?? "(no id)"} | ${r.fullName} | category=${r.teachosCategory} | computed=${r.computedStatus} | exitVerification=${r.exitVerification} | institutes=${JSON.stringify(r.institutes)}`);
  console.log("\nNon-tech TeachOS rows with no Subject (any classification):");
  for (const r of rows.filter((x) => x.inTeachos && ["ENGLISH", "APTITUDE", "MATH"].includes((x.teachosCategory ?? "").toUpperCase()) && !x.deptArea && !x.manualDeptArea))
    console.log(`  ${r.employeeId ?? "(no id)"} | ${r.fullName} | ${r.teachosCategory} | class=${r.classification} | computed=${r.computedStatus} | inDarwin=${r.inDarwin}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
