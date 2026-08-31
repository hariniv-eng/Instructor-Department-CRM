import { Router, type IRouter } from "express";
import { db, instructorsTable } from "@workspace/db";

const router: IRouter = Router();

type InstructorRow = typeof instructorsTable.$inferSelect;

const toApiPerson = (row: InstructorRow) => ({
  id: row.id,
  full_name: row.fullName,
  employee_id: row.employeeId,
  designation: row.designation,
});

// Fuller per-person shape for the flat "instructors" list below — this is
// what powers a click-to-expand details view on top of the headline total
// instructor count card (department/campus/payroll status per person, not
// just name+id like toApiPerson above).
const toApiInstructorSummary = (row: InstructorRow) => ({
  id: row.id,
  full_name: row.fullName,
  employee_id: row.employeeId,
  designation: row.designation,
  department: row.department,
  dept_bucket: row.deptBucket,
  dept_area: row.deptArea,
  is_payroll: row.classification === "payroll_converted",
  deployment_status: row.deploymentStatus,
  institutes: row.institutes,
  manager: row.teachosManager || row.directManager || null,
});

// This is the single reporting surface for the breakdowns requested on top
// of the TeachOS instructor-count standing rule (see reconcile.ts /
// TEACHOS_INSTRUCTOR_COUNT_RULES.md): total instructor count, department
// bifurcation, payroll vs non-payroll, campus level, reporting-manager
// level, and deployed vs in-training. All of it reads instructorsTable —
// recomputeStatuses() (reconcile.ts) is what keeps classification/
// dept_bucket/dept_area/deployment_status current on every sync or upload,
// this route just aggregates whatever's already there.
router.get("/reports/instructors", async (_req, res) => {
  const allRows = await db.select().from(instructorsTable);

  // The "total instructor count" and every breakdown here are anchored on
  // TeachOS's own instructor roster (inTeachos=true) — that's the
  // population the standing rule was written to count (see
  // TEACHOS_INSTRUCTOR_COUNT_RULES.md). This deliberately excludes
  // Darwin-only records that were never deployed in TeachOS at all
  // (computed_status "pending_deployment") — those aren't part of "the
  // TeachOS instructor count" and would otherwise inflate this report.
  const rows = allRows.filter((r) => r.inTeachos);

  // "Counted as instructors" excludes: individual excluded overrides,
  // Delivery Support (Ops and Central Managers), and Mentors — none of
  // these are instructor roles. Mentors get their own reported section
  // below rather than being silently dropped.
  const mentors = rows.filter((r) => r.classification === "mentor");
  const excludedRows = rows.filter((r) => r.classification === "excluded_other_department" || r.classification === "excluded_non_department_team" || r.classification === "excluded_ops_managers");
  const instructorRows = rows.filter((r) => r.classification !== "mentor" && r.classification !== "excluded_other_department" && r.classification !== "excluded_non_department_team" && r.classification !== "excluded_ops_managers");

  // How the "matched" figure breaks down by where the Darwin match came
  // from: primary Instructors-department sync vs the full-roster fallback
  // (see reconcileDarwinFullRosterFallback() in lib/reconcile.ts) vs not
  // found in Darwin anywhere (payroll-converted / needs-review).
  const matchedPrimary = rows.filter((r) => r.inDarwin && !r.inDarwinFullRoster).length;
  const matchedFullRosterFallback = rows.filter((r) => r.inDarwin && r.inDarwinFullRoster).length;
  const notInDarwin = rows.filter((r) => !r.inDarwin).length;

  // Requirement #1: total instructor count excluding managers, non-
  // instructor teams, AND exits (unlike the dashboard's "flag, don't
  // subtract" default — this specific count is the fully-net figure).
  const activeInstructorRows = instructorRows.filter((r) => !r.exitFlag && r.manualStatus !== "exited");
  const exitedInstructorRows = instructorRows.filter((r) => r.exitFlag || r.manualStatus === "exited");

  // Requirement #2: Tech vs Non-tech, with sub-areas within each.
  const byDeptBucket = (bucket: "tech" | "non_tech") => {
    const inBucket = activeInstructorRows.filter((r) => r.deptBucket === bucket);
    const areas = new Map<string, InstructorRow[]>();
    for (const r of inBucket) {
      const key = r.deptArea ?? "Unclassified";
      if (!areas.has(key)) areas.set(key, []);
      areas.get(key)!.push(r);
    }
    return {
      count: inBucket.length,
      areas: [...areas.entries()].map(([area, people]) => ({ area, count: people.length })).sort((a, b) => b.count - a.count),
    };
  };
  const unclassifiedDept = activeInstructorRows.filter((r) => !r.deptBucket).length;

  // Requirement #3: payroll vs non-payroll.
  const payrollRows = activeInstructorRows.filter((r) => r.classification === "payroll_converted");
  const nonPayrollRows = activeInstructorRows.filter((r) => r.classification !== "payroll_converted");

  // Requirement #4: campus level — grouped by each entry in `institutes`
  // (excluding the "Training Institute" placeholder, which requirement #6
  // covers separately). A person can appear under more than one campus if
  // they're recorded against multiple institutes.
  const byCampus = new Map<string, InstructorRow[]>();
  for (const r of activeInstructorRows) {
    for (const institute of r.institutes) {
      const name = institute.trim();
      if (!name || name.toLowerCase() === "training institute") continue;
      if (!byCampus.has(name)) byCampus.set(name, []);
      byCampus.get(name)!.push(r);
    }
  }
  const campuses = [...byCampus.entries()]
    .map(([campus, people]) => ({ campus, count: people.length, instructors: people.map(toApiPerson).sort((a, b) => a.full_name.localeCompare(b.full_name)) }))
    .sort((a, b) => b.count - a.count);

  // Requirement #5: reporting-manager level. TeachOS's manager (the live
  // deployment reporting line) is preferred; falls back to Darwin's direct
  // manager when TeachOS has none recorded.
  const byManager = new Map<string, InstructorRow[]>();
  for (const r of activeInstructorRows) {
    const manager = (r.teachosManager || r.directManager || "Unassigned").trim() || "Unassigned";
    if (!byManager.has(manager)) byManager.set(manager, []);
    byManager.get(manager)!.push(r);
  }
  const managers = [...byManager.entries()]
    .map(([manager, people]) => ({ manager, count: people.length, instructors: people.map(toApiPerson).sort((a, b) => a.full_name.localeCompare(b.full_name)) }))
    .sort((a, b) => b.count - a.count);

  // Requirement #6: deployed (real campus) vs in-training.
  const deployedRows = activeInstructorRows.filter((r) => r.deploymentStatus === "deployed");
  const inTrainingRows = activeInstructorRows.filter((r) => r.deploymentStatus === "in_training");
  const unknownDeploymentRows = activeInstructorRows.filter((r) => !r.deploymentStatus);

  res.json({
    kpis: {
      total_instructor_count: activeInstructorRows.length,
      total_including_exited: instructorRows.length,
      exited_excluded_from_count: exitedInstructorRows.length,
      mentors_count: mentors.length,
      excluded_count: excludedRows.length,
      payroll_count: payrollRows.length,
      non_payroll_count: nonPayrollRows.length,
      deployed_count: deployedRows.length,
      in_training_count: inTrainingRows.length,
      unknown_deployment_count: unknownDeploymentRows.length,
    },
    darwin_match: {
      matched_primary: matchedPrimary,
      matched_full_roster_fallback: matchedFullRosterFallback,
      not_in_darwin: notInDarwin,
    },
    department: {
      tech: byDeptBucket("tech"),
      non_tech: byDeptBucket("non_tech"),
      unclassified: unclassifiedDept,
    },
    payroll: {
      payroll_converted: payrollRows.length,
      non_payroll: nonPayrollRows.length,
    },
    campuses,
    managers,
    deployment: {
      deployed: deployedRows.length,
      in_training: inTrainingRows.length,
      unknown: unknownDeploymentRows.length,
    },
    mentors: mentors.map(toApiPerson),
    // Flat list backing the click-to-expand details view under the total
    // instructor count card — every person counted in kpis.total_instructor_count,
    // sorted by name.
    instructors: [...activeInstructorRows]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(toApiInstructorSummary),
  });
});

export default router;
