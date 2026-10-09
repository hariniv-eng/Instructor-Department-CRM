// One-off (2026-10-08): everything we hold about one person's exit. Read-only.
// Usage: pnpm exec tsx --env-file=.env src/lib/connectors/_tmp_one_person_exit.ts NW2000696
import { db, instructorsTable, instructorArchiveTable, darwinboxExitsTable } from "@workspace/db";

const ID = process.argv[2];

async function main() {
  if (!ID) { console.error("Pass an employee id"); process.exit(1); }
  const live = (await db.select().from(instructorsTable)).filter((r) => r.employeeId === ID);
  console.log(`--- live instructors row(s): ${live.length}`);
  for (const r of live) console.log(JSON.stringify({ id: r.id, name: r.fullName, class: r.classification, computed: r.computedStatus, inDarwin: r.inDarwin, inTeachos: r.inTeachos, darwinStatus: r.darwinEmployeeStatus, exitFlag: r.exitFlag, exitFlagStatus: r.exitFlagStatus, exitFlagDate: r.exitFlagDate, exitLastWorkingDate: r.exitLastWorkingDate, exitVerification: r.exitVerification, manualStatus: r.manualStatus, manualExitDate: r.manualExitDate, notes: r.notes }, null, 1));
  const arc = (await db.select().from(instructorArchiveTable)).filter((r) => r.employeeId === ID);
  console.log(`\n--- archive row(s): ${arc.length}`);
  for (const r of arc) console.log(JSON.stringify({ id: r.id, name: r.fullName, inArchiveScope: r.inArchiveScope, exitDate: r.exitDate, exitVerification: r.exitVerification, exitFlag: r.exitFlag, exitFlagStatus: r.exitFlagStatus, exitFlagDate: r.exitFlagDate }, null, 1));
  const exits = (await db.select().from(darwinboxExitsTable)).filter((e) => e.employeeId === ID);
  console.log(`\n--- stored Darwin exit records: ${exits.length}`);
  for (const e of exits) {
    const raw = e.rawData ?? {};
    const keep = Object.entries(raw).filter(([k, v]) => v !== null && String(v).trim() !== "" && /status|date|exit|reason|source|department|designation|name|manager|hrbp|notice|last|resign|approv/i.test(k));
    console.log(JSON.stringify(Object.fromEntries(keep), null, 1));
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
