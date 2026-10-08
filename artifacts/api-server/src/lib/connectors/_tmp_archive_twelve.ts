// One-off (2026-10-08): why are these 12 Active people in the Instructor Archive
// although they are not on the Instructors tab? Read-only. Prints each person's
// LIVE row (what the Instructors tab is built from) and ARCHIVE row.
import { db, instructorsTable, instructorArchiveTable } from "@workspace/db";

const IDS = ["NW0007471", "NW0007237", "NW0007671", "NW0005676", "NW0007373", "NW0007265", "NW0006182", "NW0007186", "NW0007264", "NW0005209", "NW0000352"];
const NAMES = ["B Mohini Sai Meghana"];

async function main() {
  const live = await db.select().from(instructorsTable);
  const arch = await db.select().from(instructorArchiveTable);
  const maxLiveId = Math.max(...live.map((r) => r.id));
  console.log(`live rows: ${live.length} (highest id ${maxLiveId}); archive rows: ${arch.length}\n`);
  const pick = <T extends { employeeId: string | null; fullName: string }>(rows: T[], id: string | null, name?: string) =>
    rows.filter((r) => (id ? r.employeeId === id : r.fullName.trim().toLowerCase() === (name ?? "").toLowerCase()));
  const targets: Array<{ id: string | null; name?: string }> = [...IDS.map((id) => ({ id })), ...NAMES.map((name) => ({ id: null, name }))];
  for (const t of targets) {
    const l = pick(live, t.id, t.name);
    const a = pick(arch, t.id, t.name);
    console.log(`=== ${t.id ?? t.name}`);
    if (!l.length) console.log("  LIVE: no row");
    for (const r of l) console.log(`  LIVE id=${r.id} ${r.fullName} | inDarwin=${r.inDarwin} inFullRoster=${r.inDarwinFullRoster} inTeachos=${r.inTeachos} | class=${r.classification ?? "-"} bucket=${r.deptBucket ?? "-"} | dept=${r.department ?? "-"} | desig=${r.designation ?? "-"} | status=${r.manualStatus ?? r.computedStatus}`);
    if (!a.length) console.log("  ARCHIVE: no row");
    for (const r of a) console.log(`  ARCHIVE id=${r.id} inArchiveScope=${r.inArchiveScope} class=${r.classification ?? "-"} | dept=${r.department ?? "-"}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
