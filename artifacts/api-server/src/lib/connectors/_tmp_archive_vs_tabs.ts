// One-off, READ-ONLY (2026-11-11, per request: "Instructor Archive shows 681 Active but the Instructors tab 696; the Archive shows ~40
// exits but the Overview Exit data 26 -- explain both differences"). Same rules as the pages:
//   Instructors tab / Overview department count = computeDepartmentAndExceptionRows().departmentRows
//   Archive Active / SNP / Exited = loadArchivePeople() status
//   Overview Exit data = archive Exited + Darwin exit Approved + not payroll + not Operations team
// Lists everyone on one side and not the other, grouped by the reason. Employee IDs only.
//   pnpm exec tsx src/lib/connectors/_tmp_archive_vs_tabs.ts
import { db, instructorsTable } from "@workspace/db";
import { computeDepartmentAndExceptionRows, loadArchivePeople } from "../../routes/reports";

const SUPPORT = new Set(["excluded_ops_managers", "instructor_ops"]);
type A = Record<string, unknown>;

async function main() {
  const all = await db.select().from(instructorsTable);
  const r = computeDepartmentAndExceptionRows(all);
  const dept = r.departmentRows;
  const arch = (await loadArchivePeople()) as A[];
  const key = (e: unknown, t: unknown) => String(e ?? "").trim().toUpperCase() || `T:${String(t ?? "")}`;
  const archBy = new Map(arch.map((a) => [key(a.employee_id, a.teachos_user_id), a]));
  const deptBy = new Map(dept.map((d) => [key(d.employeeId, d.teachosUserId), d]));
  const count = (s: string) => arch.filter((a) => a.status === s).length;
  console.log(`Instructors tab (department): ${dept.length} | Archive: Active ${count("Active")}, SNP ${count("SNP")}, Exited ${count("Exited")} (total ${arch.length})`);

  const groups = new Map<string, string[]>();
  const add = (g: string, id: string) => groups.set(g, [...(groups.get(g) ?? []), id]);
  for (const [k, d] of deptBy) {
    const a = archBy.get(k);
    if (!a) add("In the department, NOT in the archive", k);
    else if (a.status !== "Active") add(`In the department, archive says ${a.status} (Employee Status ${d.exitVerification ?? "empty"}; Darwin exit ${d.exitFlagStatus ?? "none"})`, k);
  }
  for (const [k, a] of archBy) {
    if (a.status !== "Active" || deptBy.has(k)) continue;
    const live = all.find((x) => key(x.employeeId, x.teachosUserId) === k);
    const why = !live ? "no live row" : !live.inDarwin && !live.inTeachos ? "left Darwin and TeachOS, archive still Active (no exit date / payroll mark)" : `live row classification ${live.classification ?? "none"}, in Darwin ${live.inDarwin}, in TeachOS ${live.inTeachos}`;
    add(`Archive Active, NOT in the department: ${why}`, k);
  }
  console.log("\nA. ACTIVE: Instructors tab vs Archive Active");
  for (const [g, ids] of groups) console.log(`  ${ids.length} | ${g}\n      ${ids.join(", ")}`);

  const exited = arch.filter((a) => a.status === "Exited");
  const reasons = new Map<string, string[]>();
  for (const a of exited) {
    const id = key(a.employee_id, a.teachos_user_id);
    const st = String(a.exit_status ?? "").trim().toLowerCase();
    const why = a.is_payroll ? "payroll person (left out of Exit data)"
      : SUPPORT.has(String(a.classification ?? "")) ? "Operations team / Support (left out of Exit data)"
      : st === "approved" ? "COUNTED on the Overview Exit data"
      : st ? `Darwin exit is "${a.exit_status}", not Approved` : "no Darwin exit record (exited by a typed / old exit date)";
    reasons.set(why, [...(reasons.get(why) ?? []), id]);
  }
  console.log(`\nB. EXITS: Archive Exited ${exited.length} vs Overview Exit data`);
  for (const [g, ids] of [...reasons].sort((x, y) => y[1].length - x[1].length)) console.log(`  ${ids.length} | ${g}\n      ${ids.join(", ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
