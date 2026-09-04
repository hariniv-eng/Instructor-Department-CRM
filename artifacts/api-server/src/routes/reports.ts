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

  // Mentors count (2026-09-04, per request): sourced from Darwin directly,
  // not scoped to TeachOS — same population /reports/darwin-breakdown's
  // mentors bucket uses (matched Darwin's Instructors department primary
  // pass, classification "mentor"), regardless of whether that person has
  // ever been onboarded into TeachOS. The Overview standing-rule figure and
  // the Darwin Breakdown tab were showing two different numbers (85 vs 90)
  // for what's supposed to be the same headline count — the gap was mentors
  // Darwin has on file who don't have a TeachOS record yet at all. Taking
  // the Darwin count as the source of truth resolves that discrepancy.
  const mentors = allRows.filter((r) => r.inDarwin && !r.inDarwinFullRoster && r.classification === "mentor");
  // "Counted as instructors" excludes: individual excluded overrides,
  // Delivery Support (Ops and Central Managers), and Mentors — none of
  // these are instructor roles. Mentors get their own reported section
  // above (Darwin-scoped) rather than being silently dropped, but the
  // instructor-pool exclusion below still needs to check every TeachOS-
  // active row's own classification (a TeachOS-active mentor is still
  // excluded here even if, in some edge case, they weren't in the
  // Darwin-scoped `mentors` list above).
  const excludedRows = rows.filter((r) => r.classification === "excluded_other_department" || r.classification === "excluded_non_department_team" || r.classification === "excluded_ops_managers");
  // Operations team, specifically: Darwin's own "Delivery Support (Ops and
  // Central Managers)" department (see departmentTaxonomy.ts). This is a
  // subset of excludedRows above — excludedRows also folds in individually
  // human-reviewed exclusions from classificationOverrides.ts that have
  // nothing to do with the Ops team — so this is the precise figure for an
  // "Operations team" headline number (2026-09-04).
  const opsTeamRows = rows.filter((r) => r.classification === "excluded_ops_managers");
  // The IIT Kharagpur team is set aside the same way mentors/excluded
  // people are — a real category, not silently dropped, but not counted as
  // an instructor either (see reconcile.ts's payroll cascade, 2026-09-03).
  // A Darwin exit record used to set someone aside into its own
  // "exit_candidate" bucket too; as of 2026-09-04 that's folded into
  // payroll_converted instead (still flagged separately via exitFlag, which
  // is what excludes them from the active headcount below).
  const iitKharagpurRows = rows.filter((r) => r.classification === "iit_kharagpur_team");
  // "other_department_manual" (2026-09-04): an individually-reviewed
  // OTHER_DEPARTMENT_EMPLOYEES override (classificationOverrides.ts) — a
  // person who DOES match Darwin's Instructors department directly, but a
  // human has decided belongs in "Other department" rather than being
  // counted as an instructor or a mentor. Set aside the same way
  // mentors/excluded/IIT-Kharagpur people are.
  const manualOtherDepartmentRows = rows.filter((r) => r.classification === "other_department_manual");
  const instructorRows = rows.filter((r) => r.classification !== "mentor" && r.classification !== "excluded_other_department" && r.classification !== "excluded_non_department_team" && r.classification !== "excluded_ops_managers" && r.classification !== "iit_kharagpur_team" && r.classification !== "other_department_manual");

  // How the "matched" figure breaks down by where the Darwin match came
  // from: primary Instructors-department sync vs the full-roster fallback
  // (see reconcileDarwinFullRosterFallback() in lib/reconcile.ts) vs not
  // found in Darwin anywhere (payroll-converted / needs-review).
  const matchedPrimary = rows.filter((r) => r.inDarwin && !r.inDarwinFullRoster).length;
  const matchedFullRosterFallback = rows.filter((r) => r.inDarwin && r.inDarwinFullRoster).length;
  const notInDarwin = rows.filter((r) => !r.inDarwin).length;

  // Requirement #1: the headline "total instructor count" — per the full
  // pipeline (see TEACHOS_INSTRUCTOR_COUNT_RULES.md): start from TeachOS's
  // own distinct roster, then only two paths count as an actual instructor:
  //   (a) got an employee_id (via the TeachOS ID reference upload or
  //       Darwin) AND matched Darwin's Instructors-department data directly
  //       (inDarwin && !inDarwinFullRoster) — "normal" instructors, or
  //   (b) got an employee_id but did NOT match Darwin, and IS confirmed
  //       payroll-converted (classification === "payroll_converted", the
  //       remainder of recomputeStatuses()'s exit-candidate / IIT-Kharagpur
  //       / payroll cascade for the TeachOS-only pool — see reconcile.ts,
  //       2026-09-03).
  // Anyone who never got an employee_id at all is set aside (not counted,
  // not "excluded" either — just pending a future reference file). Anyone
  // with an employee_id who matched neither Darwin nor the payroll
  // reference falls into "other departments" below — also not counted.
  // Mentors/ops-managers/individually-excluded people are out regardless
  // (already dropped via instructorRows above). Exited people are excluded
  // from this specific net figure (the dashboard's separate "flag, don't
  // subtract" KPI still shows exits without subtracting them).
  const hasEmployeeId = (r: InstructorRow) => !!r.employeeId;
  const matchedDarwinPrimary = (r: InstructorRow) => r.inDarwin && !r.inDarwinFullRoster;
  const isPayrollConverted = (r: InstructorRow) => r.classification === "payroll_converted";

  const activeInstructorRows = instructorRows.filter((r) => !r.exitFlag && r.manualStatus !== "exited");
  const exitedInstructorRows = instructorRows.filter((r) => r.exitFlag || r.manualStatus === "exited");

  const noEmployeeIdRows = activeInstructorRows.filter((r) => !hasEmployeeId(r));
  const otherDepartmentRows = activeInstructorRows.filter((r) => hasEmployeeId(r) && !matchedDarwinPrimary(r) && !isPayrollConverted(r));

  // "Total instructor count" redefined 2026-09-04, per request, to apply
  // across the ENTIRE dashboard, not just the headline kpi: Darwin's own
  // instructor headcount (matched Darwin's Instructors department directly,
  // genuine Tech/Non-tech instructor, no override classification — the same
  // population /reports/darwin-breakdown's "instructors" bucket uses,
  // regardless of TeachOS onboarding status) PLUS the TeachOS "Payroll"
  // bucket (active in TeachOS, never matched Darwin at all — the same
  // population /reports/teachos-breakdown's "Payroll" bucket uses, which
  // already folds in the former Needs-review remainder). This population —
  // not the older employee-ID-mapping pipeline above (still computed, for
  // the no_employee_id/other_department diagnostic kpis only) — is what
  // countedInstructorRows is now built from, so every breakdown below
  // (department, campus, manager, deployment, payroll split, the
  // click-to-expand instructor list, and the CSV download) reflects it too.
  const darwinInstructorsForCount = allRows.filter((r) => r.inDarwin && !r.inDarwinFullRoster && !r.classification && (r.deptBucket === "tech" || r.deptBucket === "non_tech"));
  const teachosOnlyForPayrollCount = allRows.filter((r) => r.inTeachos && !r.inDarwin);
  const payrollConvertedForCount = teachosOnlyForPayrollCount.filter((r) => r.classification === "payroll_converted");
  const needsReviewForCount = teachosOnlyForPayrollCount.filter((r) =>
    r.classification !== "excluded_other_department"
    && r.classification !== "excluded_non_department_team"
    && r.classification !== "iit_kharagpur_team"
    && r.classification !== "payroll_converted"
  );
  const countedInstructorRows: InstructorRow[] = [...darwinInstructorsForCount, ...payrollConvertedForCount, ...needsReviewForCount];

  // Requirement #2: Tech vs Non-tech, with sub-areas within each.
  const byDeptBucket = (bucket: "tech" | "non_tech") => {
    const inBucket = countedInstructorRows.filter((r) => r.deptBucket === bucket);
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
  const unclassifiedDept = countedInstructorRows.filter((r) => !r.deptBucket).length;

  // Requirement #3: payroll vs non-payroll.
  const payrollRows = [...payrollConvertedForCount, ...needsReviewForCount];
  const nonPayrollRows = darwinInstructorsForCount;

  // Requirement #4: campus level — grouped by each entry in `institutes`
  // (excluding the "Training Institute" placeholder, which requirement #6
  // covers separately). A person can appear under more than one campus if
  // they're recorded against multiple institutes.
  const byCampus = new Map<string, InstructorRow[]>();
  for (const r of countedInstructorRows) {
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
  for (const r of countedInstructorRows) {
    const manager = (r.teachosManager || r.directManager || "Unassigned").trim() || "Unassigned";
    if (!byManager.has(manager)) byManager.set(manager, []);
    byManager.get(manager)!.push(r);
  }
  const managers = [...byManager.entries()]
    .map(([manager, people]) => ({ manager, count: people.length, instructors: people.map(toApiPerson).sort((a, b) => a.full_name.localeCompare(b.full_name)) }))
    .sort((a, b) => b.count - a.count);

  // Requirement #6: deployed (real campus) vs in-training.
  const deployedRows = countedInstructorRows.filter((r) => r.deploymentStatus === "deployed");
  const inTrainingRows = countedInstructorRows.filter((r) => r.deploymentStatus === "in_training");
  const unknownDeploymentRows = countedInstructorRows.filter((r) => !r.deploymentStatus);

  res.json({
    kpis: {
      total_instructor_count: countedInstructorRows.length,
      total_including_exited: instructorRows.length,
      exited_excluded_from_count: exitedInstructorRows.length,
      mentors_count: mentors.length,
      excluded_count: excludedRows.length,
      ops_team_count: opsTeamRows.length,
      iit_kharagpur_count: iitKharagpurRows.length,
      // New employee-ID-mapping pipeline breakdown (see comment above
      // countedInstructorRows): who's actually feeding the headline total,
      // and who's sitting in each of the two "not counted yet" buckets.
      no_employee_id_count: noEmployeeIdRows.length,
      other_department_count: otherDepartmentRows.length + manualOtherDepartmentRows.length,
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
    iit_kharagpur_team: iitKharagpurRows.map(toApiPerson),
    // Set-aside buckets from the employee-ID-mapping pipeline — not counted
    // in kpis.total_instructor_count, but surfaced so they're reviewable
    // instead of silently dropped.
    no_employee_id: noEmployeeIdRows.map(toApiPerson),
    other_department: otherDepartmentRows.map(toApiInstructorSummary),
    // Flat list backing the click-to-expand details view under the total
    // instructor count card — every person counted in
    // kpis.total_instructor_count (Darwin's own instructor headcount plus
    // the TeachOS Payroll bucket — see comment above countedInstructorRows),
    // sorted by name.
    instructors: [...countedInstructorRows]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(toApiInstructorSummary),
  });
});


// A dedicated breakdown of the TeachOS side of the standing rule, for the
// "TeachOS Breakdown" dashboard tab: how many TeachOS instructors exist,
// how many cleanly matched Darwin's Instructors department, and — of the
// ones that didn't — where each one actually landed. As of 2026-09-04, per
// request, anyone not matched directly against Darwin's Instructors
// department resolves to just two real outcomes: "Other department" (found
// in Darwin's full 3,000+ roster under a different department, TeachOS
// institute is IIT Kharagpur — its own team, or an individually-reviewed
// OTHER_DEPARTMENT_EMPLOYEES override — all folded in here rather than
// their own bucket) or "Payroll" (the exhaustive remainder of the
// TeachOS-only-leftover cascade in reconcile.ts — this now also includes
// anyone with a Darwin exit record on file, previously its own
// "exit_candidates" bucket, AND the former "needs review" safety-net
// remainder, folded in 2026-09-04 per request — there's no separate
// needs_review bucket anymore). Individually-excluded overrides round out
// the rest. All "not mapped" buckets are mutually exclusive and sum to
// not_mapped.total.
const toApiCandidate = (row: InstructorRow) => ({
  id: row.id,
  full_name: row.fullName,
  employee_id: row.employeeId,
  teachos_category: row.teachosCategory,
  department: row.department,
  designation: row.designation,
  dept_bucket: row.deptBucket,
  dept_area: row.deptArea,
  classification: row.classification,
  classification_reason: row.classificationReason,
  notes: row.notes,
});

router.get("/reports/teachos-breakdown", async (_req, res) => {
  const rows = (await db.select().from(instructorsTable)).filter((r) => r.inTeachos);

  // "other_department_manual" (2026-09-04): an individually-reviewed
  // OTHER_DEPARTMENT_EMPLOYEES override (classificationOverrides.ts) — this
  // person DOES match Darwin's Instructors department directly (so
  // structurally they'd land in matchedPrimaryRows below), but a human has
  // deliberately filed them under "Other department" instead. Carve them
  // out of the Darwin-match check on both sides so that human decision
  // wins regardless of the underlying inDarwin/inDarwinFullRoster flags.
  const isManualOtherDepartment = (r: InstructorRow) => r.classification === "other_department_manual";
  const matchedPrimaryRows = rows.filter((r) => r.inDarwin && !r.inDarwinFullRoster && !isManualOtherDepartment(r));
  const notMappedRows = rows.filter((r) => !(r.inDarwin && !r.inDarwinFullRoster) || isManualOtherDepartment(r));

  const otherDepartmentDarwinRows = notMappedRows.filter((r) => r.inDarwin && r.inDarwinFullRoster);
  const manualOtherDepartmentRows = notMappedRows.filter((r) => isManualOtherDepartment(r));
  const notInDarwinRows = notMappedRows.filter((r) => !r.inDarwin);
  const excludedRows = notInDarwinRows.filter((r) => r.classification === "excluded_other_department" || r.classification === "excluded_non_department_team");
  // IIT Kharagpur is folded into "Other department" as of 2026-09-04, per
  // request — it's still its own distinct classification value internally
  // (see reconcile.ts), just no longer its own reported bucket here.
  const iitKharagpurRows = notInDarwinRows.filter((r) => r.classification === "iit_kharagpur_team");
  const otherDepartmentRows = [...otherDepartmentDarwinRows, ...iitKharagpurRows, ...manualOtherDepartmentRows];
  // Payroll now includes anyone with a Darwin exit record on file too — see
  // reconcile.ts (2026-09-04): those used to land in their own
  // "exit_candidates" bucket, now folded into this one per request. Their
  // classification_reason still notes the exit record.
  const payrollConvertedRows = notInDarwinRows.filter((r) => r.classification === "payroll_converted");
  // "Needs review" used to be its own bucket for the exhaustive-remainder
  // safety net — anyone who reached this notInDarwin pool without an
  // excluded/IIT-Kharagpur/payroll_converted classification (in practice,
  // almost always stale Darwin department data left over from an earlier
  // sync — see reconcileDarwin(), which resets in_darwin but not the
  // department string itself). As of 2026-09-04, per request, there's no
  // separate "needs review" bucket/tile anymore — this remainder is folded
  // into Payroll too, the same exhaustive-remainder spirit the rest of this
  // pool already uses.
  const needsReviewRows = notInDarwinRows.filter((r) =>
    r.classification !== "excluded_other_department"
    && r.classification !== "excluded_non_department_team"
    && r.classification !== "iit_kharagpur_team"
    && r.classification !== "payroll_converted"
  );
  const payrollRows = [...payrollConvertedRows, ...needsReviewRows];

  res.json({
    total_active: rows.length,
    matched_with_darwin: {
      count: matchedPrimaryRows.length,
      people: matchedPrimaryRows.map(toApiCandidate),
    },
    not_mapped: {
      total: notMappedRows.length,
      other_department: {
        count: otherDepartmentRows.length,
        people: otherDepartmentRows.map(toApiCandidate),
      },
      payroll_converted: {
        count: payrollRows.length,
        people: payrollRows.map(toApiCandidate),
      },
      excluded: {
        count: excludedRows.length,
        people: excludedRows.map(toApiCandidate),
      },
    },
  });
});

// A dedicated breakdown of the Darwin side of the standing rule, for the
// "Darwin" dashboard tab: how many people sit in Darwin's Instructors
// department (the primary-pass match — in_darwin=true and NOT
// in_darwin_full_roster, i.e. matched directly against an "Instructors –
// ..." department string, not via the full-roster fallback into some other
// department — these rows are the ones that add up to the confirmed 586
// total), how many of those are genuine instructors, and who the "others"
// are: mentors (Mentors department, or a Mentor-titled person embedded in
// a tech/non-tech sub-department), Delivery Support ops/central managers
// (same "excluded_ops_managers" bucket covers both the dedicated Delivery
// Support department and a non-instructor designation found inside a tech/
// non-tech sub-department — see departmentTaxonomy.ts), individually
// excluded people (human-reviewed overrides in classificationOverrides.ts),
// a payroll-converted edge case (should normally be empty now that
// reconcilePayrollCandidates() only matches people with in_darwin=false,
// kept here in case that ever changes), and anything left uncategorized.
// Buckets are mutually exclusive and sum to total_darwin_instructors_dept.
router.get("/reports/darwin-breakdown", async (_req, res) => {
  const rows = (await db.select().from(instructorsTable)).filter(
    (r) => r.inDarwin && !r.inDarwinFullRoster,
  );

  const instructorRows = rows.filter(
    (r) => !r.classification && (r.deptBucket === "tech" || r.deptBucket === "non_tech"),
  );
  // Mentors get their own headline number alongside Instructors — they're a
  // real, legitimate category the department carries, not an "other" in the
  // leftover sense the others.* buckets below represent.
  const mentorRows = rows.filter((r) => r.classification === "mentor");
  const opsRows = rows.filter(
    (r) => r.classification === "excluded_ops_managers" || r.classification === "instructor_ops",
  );
  const excludedRows = rows.filter(
    (r) => r.classification === "excluded_other_department" || r.classification === "excluded_non_department_team",
  );
  const payrollEdgeCaseRows = rows.filter((r) => r.classification === "payroll_converted");
  const classifiedIds = new Set(
    [...instructorRows, ...mentorRows, ...opsRows, ...excludedRows, ...payrollEdgeCaseRows].map((r) => r.id),
  );
  const otherRows = rows.filter((r) => !classifiedIds.has(r.id));

  const byArea: Record<string, number> = {};
  for (const r of instructorRows) {
    const key = r.deptArea ?? "(unspecified)";
    byArea[key] = (byArea[key] ?? 0) + 1;
  }

  const othersTotal = opsRows.length + excludedRows.length + payrollEdgeCaseRows.length + otherRows.length;

  res.json({
    total_darwin_instructors_dept: rows.length,
    instructors: {
      count: instructorRows.length,
      by_area: byArea,
      people: instructorRows.map(toApiCandidate),
    },
    mentors: { count: mentorRows.length, people: mentorRows.map(toApiCandidate) },
    others: {
      total: othersTotal,
      ops_delivery_support: { count: opsRows.length, people: opsRows.map(toApiCandidate) },
      excluded: { count: excludedRows.length, people: excludedRows.map(toApiCandidate) },
      payroll_edge_case: { count: payrollEdgeCaseRows.length, people: payrollEdgeCaseRows.map(toApiCandidate) },
      uncategorized: { count: otherRows.length, people: otherRows.map(toApiCandidate) },
    },
  });
});

export default router;
