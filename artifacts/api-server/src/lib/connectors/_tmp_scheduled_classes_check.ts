// One-off, READ-ONLY (2026-10-13): do these instructors have classes SCHEDULED in the last month (any status) or the
// next month? Covers the 4 "MVR College Batch 1" instructors and the 6 NIAT (Deployed) instructors with no completed
// session ever. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_scheduled_classes_check.ts
import { db, instructorsTable } from "@workspace/db";
import { inspectScheduleForUsers } from "./instructorContribution";

const IDS = ["NW2000734", "NW2000353", "NW0007847", "NW2000593", "NW0007870", "NW0002770", "NW2000706", "NW2000729", "NW2000682"];
const NAMES = ["Swathi Sri"]; // no employee id on file -- matched by name

async function main() {
  const all = await db.select().from(instructorsTable);
  const people = all.filter((p) => (p.employeeId && IDS.includes(p.employeeId)) || NAMES.some((n) => p.fullName.toLowerCase() === n.toLowerCase()));
  console.log(`Matched ${people.length} of ${IDS.length + NAMES.length} people.\n`);
  const userIds = people.map((p) => p.teachosUserId).filter((id): id is string => !!id);
  const rows = await inspectScheduleForUsers(userIds, 30, 30);
  for (const p of people) {
    console.log(`${p.fullName} (${p.employeeId ?? "-"}) teachos id: ${p.teachosUserId ?? "NONE"}`);
    const mine = rows.filter((r) => r.instructor_user_id === p.teachosUserId);
    if (!p.teachosUserId) console.log("   no TeachOS user id on file, so no sessions can be matched");
    else if (mine.length === 0) console.log("   no sessions at all from 30 days ago to 30 days ahead");
    for (const r of mine) console.log(`   ${r.sessions} x ${r.session_status} ${r.session_type} | ${r.batch_name} | ${r.first_day} to ${r.last_day}`);
    console.log("");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
