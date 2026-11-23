// One-off, READ-ONLY (2026-11-23, per request: "instructors + mentors count on 9 Nov and 16 Nov"). FCC keeps no daily headcount, so
// it is rebuilt from the Instructor Archive (everyone in the department since the 6 Oct baseline, with date of joining and exit):
// on day D someone counts if they joined on or before D and had not left (approved exit / payroll typed date) before D.
// Support (Operations team) left out, as on the Overview card. Also rebuilds TODAY and prints the live card to check the method.
//   pnpm exec tsx src/lib/connectors/_tmp_headcount_on.ts [2026-11-09 2026-11-16 ...]
import { db, instructorsTable } from "@workspace/db";
import { loadArchivePeople, computeDepartmentAndExceptionRows } from "../../routes/reports";

type P = Record<string, any>;
const SUPPORT = ["excluded_ops_managers", "instructor_ops"];
const isSupport = (p: P) => SUPPORT.includes(String(p.classification ?? ""));
const approved = (p: P) => String(p.exit_status ?? "").trim().toLowerCase() === "approved";
const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);

function leftOn(p: P): string | null {
  if (p.is_payroll && p.manual_exit_date) return day(p.manual_exit_date);
  if (p.status === "Exited" && approved(p)) return day(p.date_of_exit);
  return null;
}

function inDeptOn(p: P, d: string): boolean {
  if (isSupport(p)) return false;
  const joined = day(p.date_of_joining);
  if (joined && joined > d) return false;
  const left = leftOn(p);
  if (left && left < d) return false;
  if (p.status === "Exited" && !left) return false;
  return true;
}

async function main() {
  const live = computeDepartmentAndExceptionRows(await db.select().from(instructorsTable));
  const liveI = live.countedInstructorRows.length;
  const liveM = live.mentors.length;
  const people = (await loadArchivePeople()) as P[];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const args = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const dates = [...(args.length ? args : ["2026-11-01", "2026-11-09", "2026-11-16"]), today];
  const noJoin = people.filter((p) => !isSupport(p) && !p.date_of_joining).length;
  console.log(`Live Instructors + Mentors card: ${liveI + liveM} (instructors ${liveI}, mentors ${liveM})`);
  console.log(`Archive people with no date of joining (counted as joined): ${noJoin}\n`);
  console.log("date|instructors+mentors|instructors|mentors|deployed|in-training");
  for (const d of dates) {
    const on = people.filter((p) => inDeptOn(p, d));
    const m = on.filter((p) => p.classification === "mentor").length;
    const dep = on.filter((p) => p.deployed_or_training === "Deployed").length;
    const label = d === today ? `${d} (today, rebuilt)` : d;
    console.log(`${label}|${on.length}|${on.length - m}|${m}|${dep}|${on.length - dep}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
