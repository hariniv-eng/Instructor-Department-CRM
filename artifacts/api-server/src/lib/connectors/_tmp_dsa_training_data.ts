// One-off, READ-ONLY (2026-10-12): what DSA-track training data we hold (DSA / DIA / IPS columns), from the synced
// instructor_training_status table. Prints counts per column and status, then one line per instructor.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_dsa_training_data.ts
import { db, instructorsTable, instructorTrainingStatusTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const KEYS = ["dsa", "dia", "ips"];

async function main() {
  const rows = await db.select().from(instructorTrainingStatusTable).where(inArray(instructorTrainingStatusTable.courseKey, KEYS));
  const people = await db.select().from(instructorsTable);
  const byUser = new Map(people.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId as string, p]));
  const syncedAt = rows.map((r) => r.syncedAt).sort().pop();
  console.log(`Last synced: ${syncedAt?.toISOString?.() ?? "never"}\n`);

  console.log("Counts per column (instructors with data):");
  for (const key of KEYS) {
    const list = rows.filter((r) => r.courseKey === key);
    const c = (s: string) => list.filter((r) => r.status === s).length;
    console.log(`  ${key.toUpperCase()}: ${list.length} instructors -- completed ${c("COMPLETED")}, in progress ${c("IN_PROGRESS")}, not started ${c("NOT_STARTED")}`);
  }
  const anyUsers = new Set(rows.map((r) => r.instructorUserId));
  console.log(`\nDistinct instructors with any DSA-track data: ${anyUsers.size}`);
  const unmatched = [...anyUsers].filter((id) => !byUser.has(id));
  console.log(`  of which not matched to an FCC person: ${unmatched.length}\n`);

  console.log("name\temployee_id\tsubject\tDSA\tDIA\tIPS\tunits (done/total) DSA | DIA | IPS");
  for (const id of anyUsers) {
    const p = byUser.get(id);
    const cell = (k: string) => rows.find((r) => r.instructorUserId === id && r.courseKey === k);
    const st = (k: string) => cell(k)?.status ?? "-";
    const un = (k: string) => { const c = cell(k); return c ? `${c.unitsCompleted}/${c.unitsTotal}` : "-"; };
    console.log([p?.fullName ?? `(unmatched ${id})`, p?.employeeId ?? "", p?.deptArea ?? "", st("dsa"), st("dia"), st("ips"), `${un("dsa")} | ${un("dia")} | ${un("ips")}`].join("\t"));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
