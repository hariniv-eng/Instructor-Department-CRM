// One-off, READ-ONLY (2026-11-23, per request: "number of instructors joined", with the weekly exits and exit %). For each week of
// November (1-7, 8-14, 15-21 by default): joiners (Instructor Archive date of joining in the week), exits (approved Darwin exit or payroll
// typed date, by date of exit -- never the raised date), pending exits, and the headcount at the start of the week rebuilt the same way
// as _tmp_headcount_on.ts. Support (Operations team) left out. Lists joiners and exits by employee ID and name (terminal only).
//   pnpm exec tsx src/lib/connectors/_tmp_weekly_joiners_exits.ts
import { loadArchivePeople } from "../../routes/reports";

type P = Record<string, any>;
const SUPPORT = ["excluded_ops_managers", "instructor_ops"];
const isSupport = (p: P) => SUPPORT.includes(String(p.classification ?? ""));
const approved = (p: P) => String(p.exit_status ?? "").trim().toLowerCase() === "approved";
const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const role = (p: P) => (p.classification === "mentor" ? "Mentor" : "Instructor");
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(2)}%` : "-");

function leftOn(p: P): string | null {
  if (p.is_payroll && p.manual_exit_date) return day(p.manual_exit_date);
  if (p.status === "Exited" && approved(p)) return day(p.date_of_exit);
  return null;
}
function inDeptOn(p: P, d: string): boolean {
  const joined = day(p.date_of_joining);
  if (joined && joined > d) return false;
  const left = leftOn(p);
  if (left && left < d) return false;
  if (p.status === "Exited" && !left) return false;
  return true;
}

const WEEKS: [string, string, string][] = [
  ["Week 1 (1-7 Nov)", "2026-11-01", "2026-11-07"],
  ["Week 2 (8-14 Nov)", "2026-11-08", "2026-11-14"],
  ["Week 3 (15-21 Nov)", "2026-11-15", "2026-11-21"],
];

async function main() {
  const people = ((await loadArchivePeople()) as P[]).filter((p) => !isSupport(p));
  const pendingDate = (p: P) => (String(p.exit_status ?? "").toLowerCase().startsWith("pending") ? day(p.date_of_exit) : null);
  console.log("week|headcount_at_start|joined|joined_instructors|joined_mentors|exits|exits_deployed|exits_in_training|exit_%|pending_exits");
  const lists: string[] = [];
  for (const [w, a, b] of WEEKS) {
    const head = people.filter((p) => inDeptOn(p, a)).length;
    const joined = people.filter((p) => { const j = day(p.date_of_joining); return !!j && j >= a && j <= b; });
    const exits = people.filter((p) => { const l = leftOn(p); return !!l && l >= a && l <= b; });
    const pending = people.filter((p) => { const d = pendingDate(p); return !!d && d >= a && d <= b; });
    const jm = joined.filter((p) => role(p) === "Mentor").length;
    const ed = exits.filter((p) => p.deployed_or_training === "Deployed").length;
    console.log([w, head, joined.length, joined.length - jm, jm, exits.length, ed, exits.length - ed, pct(exits.length, head), pending.length].join("|"));
    for (const p of joined) lists.push(`${w}|JOINED|${p.employee_id}|${p.full_name}|${role(p)}|${p.dept_area ?? "-"}|${p.deployed_or_training}|joined ${day(p.date_of_joining)}`);
    for (const p of exits) lists.push(`${w}|EXIT|${p.employee_id}|${p.full_name}|${role(p)}|${p.dept_area ?? "-"}|${p.deployed_or_training}|left ${leftOn(p)}`);
    for (const p of pending) lists.push(`${w}|PENDING EXIT|${p.employee_id}|${p.full_name}|${role(p)}|${p.dept_area ?? "-"}|${p.deployed_or_training}|date of exit ${pendingDate(p)}`);
  }
  console.log("\nweek|type|employee_id|name|role|subject|deployed_or_training|date");
  for (const l of lists) console.log(l);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
