// One-off, READ-ONLY (2026-11-16, per request: "the instructors in Training - Readiness with no subject mapped -- check if they are part
// of IIT X DSA; if so they should not be there"). For each NIAT (Training) instructor in TeachOS with no mapped subject: Darwin department /
// sub-department / designation / manager / work location, TeachOS role / category / manager / plans, campus, FCC team, Contribution batches
// and cohorts -- and which of them mention DSA / IIT / Jashwanth. Console only.
//   pnpm exec tsx src/lib/connectors/_tmp_nosubject_iitx.ts
import { db, instructorsTable, instructorContributionTable } from "@workspace/db";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const EXCL = new Set(["excluded_other_department", "excluded_non_department_team", "excluded_ops_managers", "instructor_ops"]);
const HINT = /dsa|iit|jashwanth|nw0005864|advanced technolog/i;

async function main() {
  const contrib = new Map((await db.select().from(instructorContributionTable)).map((c) => [c.instructorUserId, c]));
  const people = (await db.select().from(instructorsTable)).filter((r) => r.inTeachos && r.teachosUserId && !EXCL.has(r.classification ?? "") && productOf(r) === "NIAT (Training)"
    && !normalizeSubjectArea(r.deptArea || r.manualDeptArea || null));
  console.log(`NIAT (Training) instructors with no mapped subject: ${people.length}\n`);
  let hits = 0;
  for (const p of people) {
    const c = contrib.get(p.teachosUserId!);
    const f: Record<string, unknown> = {
      dept: p.department, subDept: p.subDepartment, designation: p.designation, darwinManager: p.directManager, location: p.workLocation, inDarwin: p.inDarwin,
      teachosRole: p.teachosRole, teachosCategory: p.teachosCategory, teachosManager: p.teachosManager, plans: p.enrolledPlans, campus: p.institutes,
      team: p.classification, batches: c?.allBatches, cohorts: c?.niatCohorts, deployed: c?.deploymentDate,
    };
    const flagged = Object.entries(f).filter(([, v]) => HINT.test(JSON.stringify(v ?? ""))).map(([k]) => k);
    if (flagged.length) hits++;
    console.log(`${p.employeeId ?? "?"} | ${p.fullName} | ${flagged.length ? `IIT X DSA HINT in: ${flagged.join(", ")}` : "no DSA / IIT hint"}`);
    for (const [k, v] of Object.entries(f)) if (v !== null && v !== undefined && JSON.stringify(v) !== "[]" && v !== "") console.log(`    ${k}: ${JSON.stringify(v).slice(0, 200)}`);
  }
  console.log(`\nWith a DSA / IIT hint: ${hits} of ${people.length}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
