// One-off (2026-10-08): three people show as "Both" (Darwin + TeachOS) but have no TeachOS ID.
// Prints what their row actually holds, plus any other row that could be their TeachOS record. Read-only.
import { db, instructorsTable } from "@workspace/db";
import { normalize } from "../reconcile";

const IDS = ["NW2000758", "NW2000691", "NW0007615"];

async function main() {
  const rows = await db.select().from(instructorsTable);
  for (const id of IDS) {
    const r = rows.find((x) => x.employeeId === id);
    console.log(`=== ${id} ===`);
    if (!r) { console.log("  NOT in live table\n"); continue; }
    console.log(`  id=${r.id} name=${r.fullName} class=${r.classification} computed=${r.computedStatus}`);
    console.log(`  inDarwin=${r.inDarwin} inDarwinFullRoster=${r.inDarwinFullRoster} inTeachos=${r.inTeachos}`);
    console.log(`  teachosUserId=${JSON.stringify(r.teachosUserId)} teachosRole=${JSON.stringify(r.teachosRole)} teachosCategory=${JSON.stringify(r.teachosCategory)} teachosManager=${JSON.stringify(r.teachosManager)}`);
    console.log(`  institutes=${JSON.stringify(r.institutes)} enrolledPlans=${JSON.stringify(r.enrolledPlans)} darwinStatus=${r.darwinEmployeeStatus}`);
    console.log(`  notes=${JSON.stringify(r.notes)}`);
    const key = normalize(r.fullName ?? "");
    const same = rows.filter((x) => x.id !== r.id && (normalize(x.fullName ?? "") === key || (r.teachosUserId && x.teachosUserId === r.teachosUserId)));
    for (const x of same) console.log(`  possible twin: id=${x.id} ${x.fullName} emp=${x.employeeId} tid=${x.teachosUserId} inDarwin=${x.inDarwin} inTeachos=${x.inTeachos}`);
    console.log("");
  }
  const noTid = rows.filter((x) => x.inTeachos && !x.teachosUserId);
  console.log(`All rows with inTeachos=true but no teachosUserId: ${noTid.length}`);
  for (const x of noTid) console.log(`  ${x.employeeId ?? "(no id)"} | ${x.fullName} | inDarwin=${x.inDarwin} | class=${x.classification}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
