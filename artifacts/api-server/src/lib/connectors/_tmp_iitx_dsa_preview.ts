// One-off (2026-10-08): who is IIT X DSA under the old rule vs the new rule. Read-only.
// Old: designation has "software developer" AND location has "kapil kavuri hub".
// New: location has "kapil kavuri hub"/"kkh" AND Darwin manager is Jashwanth Dandu / NW0005864.
import { db, instructorsTable } from "@workspace/db";

async function main() {
  const rows = (await db.select().from(instructorsTable)).filter((r) => r.inDarwin && r.computedStatus !== "excluded" && r.manualStatus !== "exited");
  const loc = (r: (typeof rows)[number]) => (r.workspace ?? "").toLowerCase();
  const atKkh = (r: (typeof rows)[number]) => loc(r).includes("kapil kavuri hub") || loc(r).includes("kkh");
  const oldRule = (r: (typeof rows)[number]) => (r.designation ?? "").toLowerCase().includes("software developer") && loc(r).includes("kapil kavuri hub");
  const newRule = (r: (typeof rows)[number]) => {
    const dm = (r.directManager ?? "").toLowerCase();
    const noCm = !((r.teachosManager || r.manualCapabilityManager || "").trim());
    return atKkh(r) && (noCm || dm.includes("nw0005864") || dm.includes("jashwanth dandu"));
  };
  const line = (r: (typeof rows)[number]) => `${r.employeeId ?? "-"} | ${r.fullName} | class=${r.classification} | desig=${r.designation} | loc=${r.workspace} | capMgr=${r.teachosManager || r.manualCapabilityManager || "(empty)"} | darwinMgr=${r.directManager}`;
  const both = rows.filter((r) => oldRule(r) && newRule(r)), onlyOld = rows.filter((r) => oldRule(r) && !newRule(r)), onlyNew = rows.filter((r) => !oldRule(r) && newRule(r));
  console.log(`Darwin rows considered: ${rows.length}\nOld rule: ${rows.filter(oldRule).length} | New rule: ${rows.filter(newRule).length} | in both: ${both.length}\n`);
  console.log(`LEAVE IIT X DSA (old only): ${onlyOld.length}`); onlyOld.forEach((r) => console.log("  " + line(r)));
  console.log(`\nJOIN IIT X DSA (new only): ${onlyNew.length}`); onlyNew.forEach((r) => console.log("  " + line(r)));
  const kkhOthers = rows.filter((r) => atKkh(r) && !newRule(r));
  console.log(`\nAt KKH but NOT IIT X DSA under the new rule: ${kkhOthers.length}`); kkhOthers.forEach((r) => console.log("  " + line(r)));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
