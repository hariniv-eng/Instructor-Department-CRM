import { Router, type IRouter } from "express";
import { db, instructorsTable, instructorArchiveTable, darwinboxActiveTable, darwinboxFullRosterTable, darwinboxExitsTable, instructorTrainingStatusTable, instructorTaughtCourseTable, instructorDemoCourseTable, exitCardSnapshotTable, instructorContributionTable, instructorContributionDailyTable, instructorManualJoiningTable, instructorEvaluationDailyTable, instructorTimeSpentDailyTable } from "@workspace/db";
import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { cell, parseLooseDate, toISODate } from "../lib/reconcile";
import { archiveInstructors } from "../lib/archiveInstructors";
import { TRAINING_COURSE_TAXONOMY, isResolvedCourse } from "../data/trainingCourseTaxonomy";
import { TECH_AREAS, normalizeSubjectArea } from "../lib/departmentTaxonomy";
import { isPinnedConfirmedInstructor } from "../data/classificationOverrides";
import { productOf } from "../lib/product";
import { taughtSubjectColumn, courseColumnOf, portalColumnOf, TAUGHT_SUBJECT_COLUMNS } from "../lib/connectors/taughtTraining";
import { LECTURE_COURSES } from "../data/lectureSessions";

// Pinned edge-case instructors (NW0005068): see isPinnedConfirmedInstructor() in
// data/classificationOverrides.ts. Kept counted on every sync until their Darwin
// department actually changes.
const isConfirmedDespiteFullRoster = isPinnedConfirmedInstructor;

// Classifications that mean a row was never really part of the Instructor
// Department to begin with -- a genuinely different team, reviewed and
// filed elsewhere on purpose (see classificationOverrides.ts and
// classifyDepartment()'s iit_kharagpur_team branch). Deliberately does NOT
// include "excluded_ops_managers" (Ops team IS part of the department) or
// "mentor" (Mentors IS part of the department too). Hoisted to module
// scope (2026-10-05) so it's shared by exceptionRows below (the Exception
// queue / Darwin Exit Details tab fix) and the Instructor Archive route
// further down (the "Archive is missing 34 fully-exited people" fix) --
// both need the exact same "is this row part of the department at all"
// test, applied to allRows instead of the live-presence-gated
// departmentRows, for the same underlying reason: a row that's fully
// exited from Darwin AND TeachOS still has classification: null on most
// genuine instructors, so it keeps passing this test and staying visible;
// it only fails when the person was deliberately filed under a different
// team from the start.
const NOT_DEPARTMENT_CLASSIFICATIONS = new Set(["excluded_other_department", "excluded_non_department_team", "iit_kharagpur_team", "other_department_manual"]);

const router: IRouter = Router();

type InstructorRow = typeof instructorsTable.$inferSelect;
type ArchiveRow = typeof instructorArchiveTable.$inferSelect;

// Per-person shape for GET /reports/instructor-archive below -- the
// Instructor Archive tab (2026-10-05, made visible per request: "we will
// create a data base of all the instructor department data ... new record
// added to the darwin data ... should be added ... exit record created ...
// should not remove there data but instead add there exit date"). This
// data already existed before that request -- instructorArchiveTable,
// populated by archiveInstructors() (lib/archiveInstructors.ts) at the end
// of every recomputeStatuses() run, originally built 2026-09-28 for a
// related but different request (payroll-converted instructors losing
// their Darwin data). Nothing had ever read it back out until this route.
// Archive exit rule (2026-10-06, per request: "whoever data that we have
// recorded in the exit, get their data only if status was approved ... and
// also pending for approval"). On the Archive page a person counts as Exited
// ONLY from a Darwinbox exit record that is Approved or Pending With Approver
// (their most recent record wins). When the most recent record is
// Revoked/Rejected, their latest Approved record still counts if they have
// one; a Revoked/Rejected request or a cancelled pending one never does. A manually set exit date (Manual Status
// control) is kept for people with no Approved record. Archive page only: the
// live exit flag, Exception queue, Darwin Exit Details and sync are untouched.
// Payroll (2026-10-24, per request): back to the rule used before 2026-10-16 -- Payroll = the payroll_converted
// classification (TeachOS-only: no Darwin record anywhere, not IIT Kharagpur). The Employee Status dropdown does not change it.
// Plus (2026-10-24, per request) people converted recently (e.g. after 16 Oct) whom Darwin has not dropped yet: anyone with a
// Darwin exit record whose Capability Manager marked Payroll Converted also counts as Payroll.
export const isPayrollPerson = (r: { classification?: string | null; exitFlag?: boolean | null; exitVerification?: string | null }): boolean =>
  r.classification === "payroll_converted" || (!!r.exitFlag && r.exitVerification === "payroll_converted");

// `lastWorkingDate` (2026-10-08): the exit record's own "Date Of Exit" column (last working day) -- the archive's Date of Exit column. `date` stays the request date ("Exit Date"), used only to rank records and decide Exited.
type ApprovedExitFallback = { status: string; date: string; lastWorkingDate: string | null };

const toApiArchiveSummary = (row: ArchiveRow, approvedExit?: ApprovedExitFallback) => {
  // Exit date prefers exitFlagDate -- the Darwinbox-exit-record-driven
  // field, auto-synced by recomputeStatuses() AND auto-CLEARED back to
  // null the moment that record's most recent status is Revoked or
  // Rejected (see loadLatestExitsByPerson() in reconcile.ts: a winning
  // Revoked/Rejected record is filtered out of byEmployeeId entirely, so
  // findExit() returns undefined and exitFlag/exitFlagStatus/exitFlagDate
  // all go back to false/null/null) -- over the separate manually-set
  // exitDate (the Manual Status control's own field, which never
  // auto-clears once set, unlike exitFlagDate). exitFlag/exitFlagStatus/
  // exitFlagDate are LIVE-STATUS fields in archiveInstructors() (always
  // overwritten verbatim, null included), so a Revoked resignation
  // correctly clears the exit date on THIS SAME archive row -- no new row
  // is ever created for it, exactly per request: "if that is status is
  // revoke no need to create another column, just remove the exit date".
  // A later genuine rehire naturally gets a new row instead, the ordinary
  // way archiveInstructors() creates one for anyone it's never matched
  // before -- per request, Darwinbox always issues a new employee_id for a
  // rehire, so the new live instructorsTable row never matches this old
  // archived one by employee_id (teachos_user_id/name fallback matching in
  // findArchiveMatch() could in principle still catch it, but that's the
  // same fallback every other archived person already relies on).
  // NOTE (2026-10-06): the exitFlagDate-first logic described above is
  // superseded by the Approved-only rule at the top of this block.
  // Status follows the manual Employee Status (exit_verification) dropdown
  // (2026-10-08, per request): "payroll" -> still working, so Active with no
  // exit shown (a payroll instructor has a Darwin exit record only because
  // they moved off Darwin payroll, they are not leaving); "serving notice
  // period" -> SNP. Otherwise it is Exited once an exit date exists, else Active.
  const manualPayroll = row.exitVerification === "payroll_converted";
  const manualSnp = row.exitVerification === "serving_notice_period";
  const exitDate = manualPayroll ? null : (approvedExit?.date ?? row.exitDate ?? null);
  const status: "Active" | "Exited" | "SNP" = manualPayroll ? "Active" : manualSnp ? "SNP" : exitDate ? "Exited" : "Active";
  return {
    id: row.id,
    employee_id: row.employeeId,
    teachos_user_id: row.teachosUserId,
    full_name: row.fullName,
    designation: row.designation || row.exitDesignation || null,
    department: row.department || row.exitDepartment || null,
    dept_area: normalizeSubjectArea(row.deptArea || row.manualDeptArea || null),
    classification: row.classification,
    institutes: row.institutes,
    capability_manager: row.teachosManager || row.manualCapabilityManager || null,
    darwin_manager: row.directManager || null,
    date_of_joining: row.dateOfJoining,
    org_email: row.orgEmail,
    // workspace, not workLocation -- same Darwin source column the live
    // Instructors tab's own work_location field uses (toApiInstructorSummary
    // below), per its 2026-09-17 correction.
    work_location: row.workspace,
    gender: row.gender || row.exitGender || row.manualGender || null,
    enrolled_plans: row.enrolledPlans,
    // Whether this person was a payroll-converted instructor (never had a
    // Darwin record of their own -- active in TeachOS only) rather than a
    // regular Nxtwave-payroll Darwin instructor -- same classification
    // check the live Instructors tab's own is_payroll uses
    // (toApiInstructorSummary above). Added 2026-10-05, per request:
    // "check for exit if they are payroll or not" -- lets the Archive
    // table show, for an exited person, which payroll bucket they left
    // from.
    // Payroll = ONLY the Capability Manager's manual Employee Status "Payroll Converted" (2026-10-19, per request), never the automatic
    // payroll_converted classification: that tag also lands on people who resigned (Darwin drops their active record when they leave),
    // e.g. Rahul Kumar Singh -- CM-marked Exited, Darwin Approved -- showed as Payroll and was hidden from the Overview's exits.
    // Payroll people with no exit record still get Payroll Converted filled in by default by the sync (reconcile.ts), so they keep it.
    is_payroll: isPayrollPerson(row),
    exit_date: exitDate,
    // Date of Exit column: ONLY the Darwin exit data's "Date Of Exit" (last working day); blank when the record has none, never the request date. Payroll people are Active, so blank.
    // Enforced explicitly (2026-10-08): an Active person never shows a Date of Exit, payroll or not.
    date_of_exit: status === "Active" ? null : approvedExit?.lastWorkingDate ?? null,
    exit_status: approvedExit && !manualPayroll ? approvedExit.status : null,
    status,
    first_seen_at: row.firstSeenAt,
    last_synced_at: row.lastSyncedAt,
  };
};

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
// Archived copy of the Darwin/TeachOS fields the Instructors tab shows (2026-10-13, per request: "even when an instructor is
// removed ... converted to payroll, even the Darwin is removed ... we can still have their data so that from the instructor tab
// we can reflect the data"). Used ONLY as a fallback for a person with no current Darwin record: a live Darwin value always wins.
type ArchiveFallback = Pick<ArchiveRow, "employeeId" | "teachosUserId" | "dateOfJoining" | "orgEmail" | "workspace" | "gender" | "exitGender" | "manualGender" | "designation" | "exitDesignation" | "deptArea" | "manualDeptArea" | "directManager" | "niatCohorts">;

const toApiInstructorSummary = (row: InstructorRow, contributionByTeachosId: Map<string, string[]>, archived?: ArchiveFallback) => ({
  id: row.id,
  full_name: row.fullName,
  employee_id: row.employeeId,
  // Shown only while the person is ACTIVE in TeachOS (2026-10-07, per request):
  // the stored ID stays on the row after they go inactive so they can be
  // re-matched later, but it is stale then and must not look like TeachOS access.
  teachos_user_id: row.inTeachos ? row.teachosUserId : null,
  // Falls back to exitDesignation/exitDepartment (2026-09-21, per request:
  // "payroll converted instructor dont have data like gender subject and
  // the department and also role ... get that data from the exit, map the
  // payroll instructors with there employee_id with the whole exit data").
  // Both Darwin-sourced columns are always null for a payroll-converted
  // person (no Darwin record at all) -- recomputeStatuses() (reconcile.ts)
  // now backfills these two from that population's matched Darwinbox exit
  // record instead, keyed by employeeId (same findExit() lookup exitFlag
  // already uses). Darwin's own value always wins when present -- this is
  // strictly a gap-filler for the population that has nothing else, same
  // "computed always wins over a lesser source" convention as gender/
  // dept_area below.
  designation: row.designation || row.exitDesignation || archived?.designation || archived?.exitDesignation || null,
  department: row.department || row.exitDepartment || null,
  dept_bucket: row.deptBucket,
  // Added (2026-09-22, per request: a "bifurcation" column on the
  // Instructors tab table showing Instructor / Mentor / Delivery Support).
  // dept_bucket above isn't enough on its own for this: recomputeStatuses()
  // (reconcile.ts) deliberately NULLS deptBucket for every Mentor/Ops-team
  // row (isDeptExclusion), so dept_bucket alone can't tell a Mentor or Ops
  // row apart from an ordinary instructor once they're mixed together in
  // the combined "Instructor Department"/"Exception" tab views. classification
  // is the field that's actually reliable for that ("mentor" /
  // "excluded_ops_managers" vs. everything else this report ever includes --
  // see the frontend's bifurcationLabel()).
  classification: row.classification,
  // Falls back to manualDeptArea (2026-09-15, per request) -- a human can
  // mark the real Subject/teaching area by hand for exactly the people
  // classifyDepartment() left unclassified (see the PATCH
  // /instructors/:id/subject route and manualDeptArea's comment in the
  // schema). The computed value, when present, always wins --
  // manualDeptArea is a gap-filler, not a correction path. dept_area_source
  // mirrors gender_source/capability_manager_source above: tells the
  // frontend whether to render plain text (computed) or the manual-entry
  // dropdown (manual/none) -- deliberately not offered at all for
  // Operations team rows, whose null dept_area is intentional, not a gap.
  // Archived subject is the last fallback (2026-10-13): shown as a locked "computed" value, since it was computed earlier.
  dept_area: normalizeSubjectArea(row.deptArea || row.manualDeptArea || archived?.deptArea || archived?.manualDeptArea || null),
  dept_area_source: row.deptArea ? "computed" : row.manualDeptArea ? "manual" : (archived?.deptArea || archived?.manualDeptArea) ? "computed" : null,
  // Payroll = ONLY the Capability Manager's manual Employee Status "Payroll Converted" (2026-10-19, per request), never the automatic
  // payroll_converted classification: that tag also lands on people who resigned (Darwin drops their active record when they leave),
  // e.g. Rahul Kumar Singh -- CM-marked Exited, Darwin Approved -- showed as Payroll and was hidden from the Overview's exits.
  // Payroll people with no exit record still get Payroll Converted filled in by default by the sync (reconcile.ts), so they keep it.
  is_payroll: isPayrollPerson(row),
  deployment_status: row.deploymentStatus,
  institutes: row.institutes,
  // Capability Manager (TeachOS's own instructor_manager assignment, see
  // reconcileCapabilityManager() in reconcile.ts) and Manager (Darwin)
  // (Darwin's own Direct Manager field) are two different concepts -- org
  // hierarchy vs. TeachOS capability assignment -- shown as two explicit
  // columns everywhere in the Overview drill-down (2026-09-07/08, per
  // request). The old combined `manager` field (teachosManager || directManager
  // fallback) has been removed entirely (2026-09-08, per request) now that
  // every card shows both explicit columns instead of one ambiguous one.
  // Falls back to manualCapabilityManager (2026-09-15, per request) -- a
  // human can mark the real Capability Manager by hand for exactly the
  // people TeachOS's own candidate rows didn't resolve to anyone on the
  // maintained roster (see the PATCH /instructors/:id/capability-manager
  // route and manualCapabilityManager's comment in the schema). TeachOS,
  // when it has an answer, always wins -- manualCapabilityManager is a
  // gap-filler, not a correction path for TeachOS data. capability_manager_source
  // mirrors gender_source below: tells the frontend whether to render plain
  // text (teachos) or the manual-entry dropdown (manual/none).
  capability_manager: row.teachosManager || row.manualCapabilityManager || null,
  capability_manager_source: row.teachosManager ? "teachos" : row.manualCapabilityManager ? "manual" : null,
  darwin_manager: row.directManager || (!row.inDarwin ? archived?.directManager : null) || null,
  // Darwin's Date of joining -- added to the Instructors-tab table (2026-09,
  // per request), mirroring the same field already on every Darwin
  // Breakdown bucket (see toApiCandidate below). Gated on inDarwin (not just
  // "is dateOfJoining set"): reconcileDarwin() resets inDarwin to false for
  // everyone at the start of every sync but does NOT clear the stored
  // dateOfJoining column, so someone who had a Darwin match in an earlier
  // sync and has since dropped out of it would otherwise still show that
  // stale date. Per request (2026-09-09): no Darwin access right now ->
  // blank, regardless of what's sitting in the column from before.
  // 2026-10-13: a person with no current Darwin record falls back to the date archived while they were in Darwin.
  date_of_joining: row.inDarwin ? row.dateOfJoining : (archived?.dateOfJoining ?? null),
  // Darwin's own "Org Email Id" field -- added to the Instructors tab table
  // (2026-09-15, per request). Same gating as date_of_joining above: a
  // TeachOS-only row (no current Darwin access, or a stale value left over
  // from a past Darwin match) shows blank rather than a stale email.
  org_email: row.inDarwin ? row.orgEmail : (archived?.orgEmail ?? null),
  // Darwin's own "Workspace" field -- powers the Instructors tab table's
  // "Location (Darwin)" column. Originally sourced from Darwin's "Work
  // Location" field (2026-09-15); switched to "Workspace" instead
  // (2026-09-17, per request) -- same API field name (work_location) and
  // frontend column, just a different Darwin source column feeding it.
  // Distinct from the existing Campus column (institutes, TeachOS
  // deployment). Same gating as date_of_joining/org_email above.
  work_location: row.inDarwin ? row.workspace : (archived?.workspace ?? null),
  // Darwin's own Gender field -- added (2026-09-09, per request) to power a
  // gender filter + male/female count on the Instructors tab. Same gating
  // as date_of_joining above: a TeachOS-only row (no Darwin record at all,
  // or a stale value from a past Darwin match) doesn't get Darwin's value.
  // Falls back to manualGender (2026-09-09, follow-up request) -- a human
  // can mark gender by hand for exactly the people Darwin can't supply it
  // for (see the PATCH /instructors/:id/gender route and manualGender's
  // comment in the schema). Darwin, when it has an answer, always wins --
  // manualGender is a gap-filler, not a correction path for Darwin data.
  // gender_source tells the frontend whether the value shown is locked
  // (from Darwin) or editable (manual/none), so it knows whether to render
  // plain text or the manual-gender dropdown for a given row.
  //
  // Also falls back to exitGender (2026-09-21, per request — see
  // designation/department's comment above): a payroll-converted person's
  // matched Darwinbox exit record often carries its own Gender field, one
  // tier below Darwin's own value and above the human-entered manual
  // fallback. GenderCell on the frontend only special-cases
  // gender_source === 'darwin' as locked read-only text -- 'exit' falls
  // through to the same editable dropdown 'manual'/null already get
  // (pre-filled with the exit-derived value), which is intentional: unlike
  // Darwin's own field, an exit record is a secondary source, so leaving it
  // correctable by whoever reviews the row is safer than presenting it as
  // locked fact.
  gender: (row.inDarwin ? row.gender : null) ?? row.exitGender ?? row.manualGender ?? archived?.gender ?? archived?.exitGender ?? archived?.manualGender ?? null,
  // Archived Darwin gender is locked like a live Darwin value (2026-10-13).
  gender_source: row.inDarwin && row.gender ? "darwin" : row.exitGender ? "exit" : row.manualGender ? "manual" : archived?.gender ? "darwin" : archived?.exitGender ? "exit" : archived?.manualGender ? "manual" : null,
  // Whether this person has a live Darwinbox exit record on file (2026-09-17,
  // per request) -- not gated on inDarwin like the fields above, since
  // exitFlag is computed straight from darwinboxExitsTable and stays
  // meaningful whether or not this person currently has Darwin access. Used
  // by the Instructors tab table to decide whether to render the Exit
  // column's manual-verification dropdown (exit_flag true) or a plain dash.
  exit_flag: row.exitFlag,
  // Darwinbox exit record's status/date (added 2026-10-07 for the Overview's
  // Exception 2 "exit_date" column) -- same live-status fields the single-
  // instructor endpoint (routes/instructors.ts) already returns.
  exit_flag_status: row.exitFlagStatus,
  exit_flag_date: row.exitFlagDate,
  // Date of exit column (2026-10-07, per request): the Darwinbox exit
  // record's "Date Of Exit" = last working day, NOT its "Exit Date" (the day
  // the request was raised, still shown as exit_flag_date). Blank until an
  // exit record exists. Payroll instructors always have
  // an exit record without having left, so theirs is the manual date their
  // Capability Manager enters instead.
  date_of_exit: row.classification === "payroll_converted" ? row.manualExitDate ?? null : row.exitLastWorkingDate ?? null,
  // Capability Manager's manual read on an exit-flagged record -- "exited" |
  // "serving_notice_period" | "payroll_converted" | null. Purely a tracking
  // label; see exitVerification's comment in the schema for why it never
  // touches computed/manual status or the headcount.
  exit_verification: row.exitVerification,
  // TeachOS's "enrolled_plans" column (2026-09-27, per request: "show it as
  // a new column") -- no fallback source, plain TeachOS-sourced display
  // field. See enrolledPlans' comment in the schema for where this actually
  // lives in BigQuery (a separate dataset from the rest of this connector).
  enrolled_plans: row.enrolledPlans,
  // NIAT cohort year(s) (2026-09-29, per request: "the contribution column
  // that we have created... should be reflected in the instructor table,
  // in the instructor tab also") -- same values as the Contribution tab's
  // own Contribution column (see BATCH_NAME_TO_NIAT_COHORT in
  // instructorContribution.ts), joined here against instructorContributionTable
  // via teachosUserId (same key toApiInstructorSummary's caller already
  // uses for everything else that's TeachOS-sourced). Empty for anyone with
  // no teachosUserId, or no matching contribution row at all (never synced,
  // or genuinely no COMPLETED sessions in the last 30 days) -- same "empty,
  // not missing" convention as institutes/enrolled_plans above.
  // Falls back to the archived cohorts (2026-10-13) when the live contribution table has none for the person.
  niat_cohorts: (() => {
    const live = (row.inTeachos && row.teachosUserId && contributionByTeachosId.get(row.teachosUserId)) || [];
    return live.length > 0 ? live : (archived?.niatCohorts ?? []);
  })(),
});

// Instructor Department population (Instructors + Mentors + Ops team,
// scoped exactly the way /reports/instructors's headline counts are below),
// plus the Exception review queue carved out of it. Extracted into its own
// function (2026-09-27, per request: "can you keep this exception filter in
// the darwin exit tab that will help get the records of exceptions") so
// /reports/darwin-exit-details can know which raw exit records belong to
// someone currently sitting in that queue, without duplicating (and risking
// drifting from) this exact eligibility logic — both routes now call this
// one function instead of each keeping its own copy. See exceptionRows'
// definition below for the full "who counts as an Exception" reasoning
// (unresolved exit-flagged people within the Instructor Department
// population only — a review queue, not a headcount bucket).
export function computeDepartmentAndExceptionRows(rawRows: InstructorRow[]) {
  // Edge case (2026-10-07, per request: "she should be considered as an edge
  // case"): anyone on CONFIRMED_INSTRUCTOR_DESPITE_FULL_ROSTER (NW0005068,
  // Saumya Sunil Patil) is ALWAYS counted as an ordinary Instructor, whatever
  // the sync's classification/department bucket currently says about her --
  // her Darwin department doesn't match the taxonomy, so the automatic rules
  // can't be trusted for her. Her row is treated here as an unclassified
  // Tech instructor (department bucket kept if it already is tech/non_tech).
  const allRows = rawRows.map((r) => (isConfirmedDespiteFullRoster(r)
    ? { ...r, inDarwin: true, inDarwinFullRoster: true, classification: null, deptBucket: r.deptBucket === "non_tech" ? "non_tech" : "tech" }
    : r));
  // Mentors count (2026-09-04, per request): sourced from Darwin directly,
  // not scoped to TeachOS — same population /reports/darwin-breakdown's
  // mentors bucket uses (matched Darwin's Instructors department primary
  // pass, classification "mentor"), regardless of whether that person has
  // ever been onboarded into TeachOS.
  const mentors = allRows.filter((r) => r.inDarwin && !r.inDarwinFullRoster && r.classification === "mentor");
  // Operations team, specifically: Darwin's own "Delivery Support (Ops and
  // Central Managers)" department (see departmentTaxonomy.ts), individually
  // reviewed Ops overrides included (classificationOverrides.ts). Scoped
  // across ALL rows, matching the Mentors precedent above — not just
  // TeachOS-active ones.
  const opsTeamRows = allRows.filter((r) => r.classification === "excluded_ops_managers");
  // "Total instructor count" (2026-09-04, per request) applied across the
  // ENTIRE dashboard: Darwin's own instructor headcount (matched Darwin's
  // Instructors department directly, genuine Tech/Non-tech instructor, no
  // override classification) PLUS the TeachOS "Payroll" bucket (active in
  // TeachOS, never matched Darwin at all — folds in the former Needs-review
  // remainder).
  const darwinInstructorsForCount = allRows.filter((r) => r.inDarwin && (!r.inDarwinFullRoster || isConfirmedDespiteFullRoster(r)) && !r.classification && (r.deptBucket === "tech" || r.deptBucket === "non_tech"));
  const teachosOnlyForPayrollCount = allRows.filter((r) => r.inTeachos && !r.inDarwin);
  const payrollConvertedForCount = teachosOnlyForPayrollCount.filter((r) => r.classification === "payroll_converted");
  const needsReviewForCount = teachosOnlyForPayrollCount.filter((r) =>
    r.classification !== "excluded_other_department"
    && r.classification !== "excluded_non_department_team"
    && r.classification !== "iit_kharagpur_team"
    && r.classification !== "payroll_converted"
  );
  const countedInstructorRows: InstructorRow[] = [...darwinInstructorsForCount, ...payrollConvertedForCount, ...needsReviewForCount];
  // The 4th "Instructor Department" Overview card: the whole department in
  // one rollup: Instructors + Mentors + Operations team together. Safe to
  // concatenate rather than re-deriving from allRows: these three lists are
  // already mutually exclusive by construction — countedInstructorRows
  // requires either no classification at all (the Darwin tech/non_tech
  // population) or !inDarwin (the TeachOS-only payroll population), mentors
  // requires classification === "mentor" (and inDarwin), opsTeamRows
  // requires classification === "excluded_ops_managers" (and inDarwin) — a
  // row can only ever match one of those three shapes.
  const departmentRows: InstructorRow[] = [...countedInstructorRows, ...mentors, ...opsTeamRows];

  // "Exception" bifurcation (2026-09-18, per request; scope revised
  // 2026-09-19; revised again 2026-09-29, per request: "whenever a
  // capability manager... try to edit the exit list or the values that we
  // have, the count of exceptions has to be decreased... only show the
  // exceptions number when that manual entry is not reviewed") -- a review
  // queue, not a headcount bucket: everyone here is already counted in
  // their normal category above, and stays counted there no matter what
  // this queue shows; only whether they show up IN THIS QUEUE changes.
  //
  // Two ways a row leaves the queue: Darwinbox's own live exit record
  // already reporting status "Revoked" (exitFlagStatus, set straight from
  // the synced Darwinbox exit report's Status field by recomputeStatuses()
  // in reconcile.ts -- see darwinboxExits.ts's comment: "Revoked" there
  // means the resignation request itself was cancelled, not a completed
  // exit) -- so a resignation Darwinbox itself already shows as cancelled
  // never needs a Capability Manager to touch anything; OR a Capability
  // Manager has recorded ANY outcome at all on the manual exit_verification
  // dropdown ("exited", "serving_notice_period", "payroll_converted",
  // "absconded" -- see EXIT_VERIFICATION_VALUES in routes/instructors.ts).
  // Reviewing is what clears the queue now, not which specific outcome was
  // picked -- an earlier version (2026-09-18/19) kept "exited"/"absconded"/
  // "serving_notice_period" visible even after being set, treating only
  // "payroll_converted"/"revoked" as resolved; that distinction is gone as
  // of this revision. Note this only affects the QUEUE, never the person's
  // actual counted category -- moving someone off the active headcount
  // still requires the separate, deliberate Manual Status control on the
  // instructor detail page (see exitVerification's comment in the schema).
  // NOT_DEPARTMENT_CLASSIFICATIONS is now a module-level constant (see its
  // own comment above) -- shared with the Instructor Archive route's fix
  // below.
  // Scoped to allRows instead of departmentRows (2026-10-05, per request:
  // "for exception if the person is exited then there details should be
  // visible in the exception but not removed from the exception table") --
  // departmentRows is correctly scoped to CURRENT Darwin/TeachOS presence
  // for headcount purposes, but that's exactly the problem for this queue:
  // the moment someone with an unresolved exit record genuinely leaves (no
  // longer in the next Darwin sync, and never in TeachOS either),
  // reconcileDarwin()'s blanket inDarwin=false reset (reconcile.ts) drops
  // them out of departmentRows on the very next sync -- so they silently
  // vanished from this review queue before any Capability Manager ever got
  // to review them, even though their own exit record is WHY exitFlag is
  // set in the first place. allRows is never row-deleted (same "flag,
  // don't subtract" guarantee used everywhere else in this app), so basing
  // the queue on allRows instead keeps their row -- and exit_flag/
  // exit_flag_status/exit_flag_date -- visible here for as long as it takes
  // someone to actually review it. The NOT_DEPARTMENT_CLASSIFICATIONS
  // exclusion above keeps this from pulling in people who were deliberately
  // filed under a different team entirely and were never in departmentRows
  // to begin with, exit record or not. Deliberately does NOT feed back into
  // departmentRows itself -- that stays a pure, current-headcount view;
  // only this queue (a worklist, not a count) now outlives a person's live
  // Darwin/TeachOS match.
  // Exception rule, restated 2026-10-06 (per request: "if their records are
  // active in Darwin or TeachOS and they have a record in exit with status
  // Approved or Pending For Approval, they should be visible in exception;
  // if reviewed and marked payroll, remove from exception; if not reviewed,
  // keep visible; if it is a serving-notice-period exit, keep visible until
  // their data is removed from both TeachOS and Darwin"). So a row is in the
  // queue when ALL of these hold:
  //   1. still present in Darwin OR TeachOS (once both are gone it leaves the
  //      queue and lives on only in the Instructor Archive);
  //   2. its exit record (employee-ID match, latest record wins) is Approved
  //      or Pending With Approver -- Revoked/Rejected never qualify;
  //   3. not resolved as Payroll Converted on the review dropdown. Not
  //      reviewed, Serving Notice Period, Exited and Absconded all stay
  //      visible while the person is still in Darwin or TeachOS (this
  //      supersedes the 2026-09-29 "any review clears the queue" rule);
  //   4. not filed under a different team.
  const exitStatusLower = (r: InstructorRow) => (r.exitFlagStatus ?? "").trim().toLowerCase();
  const hasQueueExitStatus = (r: InstructorRow) => exitStatusLower(r) === "approved" || exitStatusLower(r).startsWith("pending");
  const exceptionQueueRows = allRows.filter((r) => r.exitFlag && (r.inDarwin || r.inTeachos) && hasQueueExitStatus(r) && r.exitVerification !== "payroll_converted" && !NOT_DEPARTMENT_CLASSIFICATIONS.has(r.classification ?? ""));
  // Narrowed 2026-10-06 (per request: "in the exception, anyhow we will only be
  // showing not reviewed data and serving notice period instructor data, in
  // the Instructors tab"): the Instructors tab's Exception view shows only
  // people nobody has reviewed yet, plus those reviewed as Serving Notice
  // Period. Anyone reviewed as Exited or Absconded leaves this view -- if they
  // are still in TeachOS they move to the Overview's Exception 2 list
  // (exceptionRemoveRows below), the "remove them from TeachOS" worklist.
  // Narrowed again 2026-10-07 (per request: "in the Instructors tab we're only
  // going to show the not reviewed candidates"): Serving Notice Period people
  // now live only on the Overview's Exception 2 "Serving notice period" list
  // (servingNoticeRows below) and move to its Exit list after their date of
  // exit passes.
  const exceptionRows = exceptionQueueRows.filter((r) => !r.exitVerification);
  // Overview "Exception 3" -- exit approval still pending (2026-10-09, per request). Built from allRows, NOT from
  // exceptionQueueRows: the queue drops anyone a Capability Manager marked Payroll Converted, but a payroll-converted
  // person whose raised exit is still "Pending With Approver" in Darwin must stay on this list until Darwin shows the
  // decision. Serving-notice people stay too (they were never dropped). Only people filed under another team and
  // people no longer in Darwin or TeachOS are left out.
  // 2026-10-14, per request ("what about the 6 names ... still pending"): people who are in NEITHER Darwin nor TeachOS any more
  // but whose raised exit is still "Pending With Approver" stay on this list too. They have left, the approver simply has not
  // acted, and without them here nobody would chase the approval (they were invisible in every queue).
  const pendingApprovalRows = allRows.filter((r) => r.exitFlag && exitStatusLower(r).startsWith("pending") && !NOT_DEPARTMENT_CLASSIFICATIONS.has(r.classification ?? ""));
  // Payroll-converted instructors (2026-10-07): they carry a manual Exit entry
  // (default Payroll Converted) and usually have no Darwin exit record at all,
  // so when a Capability Manager later marks one Exited/Absconded/Serving
  // Notice Period it is the manual entry alone that puts them on the Exception 2
  // lists -- they are added here on top of the exit-record-driven queue.
  const manualPayrollRows = (statuses: string[]) => allRows.filter((r) => r.classification === "payroll_converted" && (r.inDarwin || r.inTeachos) && statuses.includes(r.exitVerification ?? ""));
  const mergeById = (a: InstructorRow[], b: InstructorRow[]) => { const seen = new Set(a.map((r) => r.id)); return [...a, ...b.filter((r) => !seen.has(r.id))]; };
  const exceptionRemoveRows = mergeById(
    exceptionQueueRows.filter((r) => (r.exitVerification === "exited" || r.exitVerification === "absconded") && r.inTeachos && r.classification !== "excluded_ops_managers"),
    manualPayrollRows(["exited", "absconded"]).filter((r) => r.inTeachos),
  );

  // Everyone in the queue reviewed as Serving Notice Period (still in Darwin
  // and/or TeachOS). The Overview's Exception 2 "Serving notice period" list
  // is built from this; once a person's Darwin Date Of Exit has passed they
  // move to the Exit list instead (see the /reports/instructors route).
  const servingNoticeRows = mergeById(
    exceptionQueueRows.filter((r) => r.exitVerification === "serving_notice_period" && r.classification !== "excluded_ops_managers"),
    manualPayrollRows(["serving_notice_period"]),
  );

  return { mentors, opsTeamRows, darwinInstructorsForCount, payrollConvertedForCount, needsReviewForCount, countedInstructorRows, departmentRows, exceptionRows, exceptionRemoveRows, servingNoticeRows, exceptionQueueRows, pendingApprovalRows };
}

// This is the single reporting surface for the breakdowns requested on top
// of the TeachOS instructor-count standing rule (see reconcile.ts /
// TEACHOS_INSTRUCTOR_COUNT_RULES.md): total instructor count, department
// bifurcation, payroll vs non-payroll, campus level, reporting-manager
// level, and deployed vs in-training. All of it reads instructorsTable —
// recomputeStatuses() (reconcile.ts) is what keeps classification/
// dept_bucket/dept_area/deployment_status current on every sync or upload,
// this route just aggregates whatever's already there.
// Public — no session required. This is what the no-login "Manager view"
// reads for the Overview + Instructors tabs (see routes/index.ts); Darwin
// Breakdown and TeachOS Breakdown below stay Admin-only.
// Workload for the Instructors tab (2026-10-16, per request: "reflect the Workload column in the Instructors tab"). The same figure the
// Contribution tab shows with no date filter (all-time), worked out the same way and with the same rounding as workloadOf() in
// contribution.tsx, so the two tabs always show the same number: Avg Hrs / Day (total session hours, one decimal, / session days, one
// decimal) + Learning Hrs / Day (learning hours, one decimal, / learning days, one decimal) + Avg Demo / AI Hrs (two decimals), a missing
// part counting as 0, total to two decimals; no entry when the person has none of the three. Keyed by TeachOS user id. Read defensively --
// if a table is not pushed / synced yet that part is just missing, and the Instructors tab never fails because of it.
async function loadWorkloadByTeachosId(): Promise<Map<string, number>> {
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const hoursPerDay = new Map<string, number>();
  const learningPerDay = new Map<string, number>();
  const evalAvg = new Map<string, number>();
  try {
    const rows = await db.select({ id: instructorContributionTable.instructorUserId, lecture: instructorContributionTable.lectureMinutes, practice: instructorContributionTable.practiceMinutes, other: instructorContributionTable.otherMinutes, days: instructorContributionTable.sessionDays }).from(instructorContributionTable);
    for (const r of rows) {
      if (!r.days || r.days <= 0) continue;
      const totalHours = round1(((r.lecture ?? 0) + (r.practice ?? 0) + (r.other ?? 0)) / 60);
      hoursPerDay.set(r.id, round1(totalHours / r.days));
    }
  } catch (err) {
    console.warn("[instructors] workload: session hours not readable:", (err as Error).message);
  }
  try {
    const totals = new Map<string, { seconds: number; days: number }>();
    for (const t of await db.select({ id: instructorTimeSpentDailyTable.instructorUserId, seconds: instructorTimeSpentDailyTable.seconds }).from(instructorTimeSpentDailyTable)) {
      const cur = totals.get(t.id) ?? { seconds: 0, days: 0 };
      cur.seconds += t.seconds;
      cur.days += 1;
      totals.set(t.id, cur);
    }
    for (const [id, t] of totals) if (t.days > 0) learningPerDay.set(id, round1(round1(t.seconds / 3600) / t.days));
  } catch (err) {
    console.warn("[instructors] workload: learning hours not readable:", (err as Error).message);
  }
  try {
    const totals = new Map<string, { demoSeconds: number; demoCount: number; aiSeconds: number; aiCount: number }>();
    for (const e of await db.select({ id: instructorEvaluationDailyTable.instructorUserId, type: instructorEvaluationDailyTable.evaluationType, seconds: instructorEvaluationDailyTable.seconds, evaluations: instructorEvaluationDailyTable.evaluations }).from(instructorEvaluationDailyTable)) {
      const t = totals.get(e.id) ?? { demoSeconds: 0, demoCount: 0, aiSeconds: 0, aiCount: 0 };
      if (e.type === "DEMO") { t.demoSeconds += e.seconds; t.demoCount += e.evaluations; } else { t.aiSeconds += e.seconds; t.aiCount += e.evaluations; }
      totals.set(e.id, t);
    }
    for (const [id, t] of totals) {
      if (t.demoCount + t.aiCount <= 0) continue;
      evalAvg.set(id, Math.round(((t.demoCount > 0 ? t.demoSeconds / 3600 / t.demoCount : 0) + (t.aiCount > 0 ? t.aiSeconds / 3600 / t.aiCount : 0)) * 100) / 100);
    }
  } catch (err) {
    console.warn("[instructors] workload: demo / AI evaluations not readable:", (err as Error).message);
  }
  const workload = new Map<string, number>();
  for (const id of new Set([...hoursPerDay.keys(), ...learningPerDay.keys(), ...evalAvg.keys()])) {
    workload.set(id, Math.round(((hoursPerDay.get(id) ?? 0) + (learningPerDay.get(id) ?? 0) + (evalAvg.get(id) ?? 0)) * 100) / 100);
  }
  return workload;
}

router.get("/reports/instructors", async (_req, res) => {
  const allRows = await db.select().from(instructorsTable);
  const { mentors, opsTeamRows, darwinInstructorsForCount, payrollConvertedForCount, needsReviewForCount, countedInstructorRows, departmentRows, exceptionRows, exceptionRemoveRows, servingNoticeRows, exceptionQueueRows, pendingApprovalRows } = computeDepartmentAndExceptionRows(allRows);

  // NIAT cohort join (2026-09-29, per request -- see niat_cohorts' comment
  // on toApiInstructorSummary above): one extra query, keyed by
  // instructor_user_id (== instructorsTable.teachosUserId), same shape as
  // every other TeachOS-sourced join this report already does at read time.
  // Only the two columns this needs (2026-10-12): selecting every column would make the Instructors tab fail to load
  // whenever the contribution table gains a column that the database has not been pushed yet.
  const contributionRows = await db.select({ instructorUserId: instructorContributionTable.instructorUserId, niatCohorts: instructorContributionTable.niatCohorts }).from(instructorContributionTable);
  const contributionByTeachosId = new Map(contributionRows.map((c) => [c.instructorUserId, c.niatCohorts]));
  // Archived Darwin/TeachOS fields for the fallback above -- only the columns the fallback reads.
  const archiveRows: ArchiveFallback[] = await db.select({
    employeeId: instructorArchiveTable.employeeId, teachosUserId: instructorArchiveTable.teachosUserId, dateOfJoining: instructorArchiveTable.dateOfJoining,
    orgEmail: instructorArchiveTable.orgEmail, workspace: instructorArchiveTable.workspace, gender: instructorArchiveTable.gender, exitGender: instructorArchiveTable.exitGender,
    manualGender: instructorArchiveTable.manualGender, designation: instructorArchiveTable.designation, exitDesignation: instructorArchiveTable.exitDesignation,
    deptArea: instructorArchiveTable.deptArea, manualDeptArea: instructorArchiveTable.manualDeptArea, directManager: instructorArchiveTable.directManager, niatCohorts: instructorArchiveTable.niatCohorts,
  }).from(instructorArchiveTable);
  const archiveByEmployeeId = new Map(archiveRows.filter((a) => a.employeeId).map((a) => [a.employeeId!, a]));
  const archiveByTeachosId = new Map(archiveRows.filter((a) => a.teachosUserId).map((a) => [a.teachosUserId!, a]));
  const workloadByTeachosId = await loadWorkloadByTeachosId();
  const summarize = (row: InstructorRow) => ({
    ...toApiInstructorSummary(row, contributionByTeachosId, (row.employeeId ? archiveByEmployeeId.get(row.employeeId) : undefined) ?? (row.teachosUserId ? archiveByTeachosId.get(row.teachosUserId) : undefined)),
    // All-time Workload, same figure as the Contribution tab with no date filter (2026-10-16) -- see loadWorkloadByTeachosId above.
    workload: row.teachosUserId ? (workloadByTeachosId.get(row.teachosUserId) ?? null) : null,
  });

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
  // above (Darwin-scoped, computed above via computeDepartmentAndExceptionRows)
  // rather than being silently dropped, but the instructor-pool exclusion
  // below still needs to check every TeachOS-active row's own
  // classification (a TeachOS-active mentor is still excluded here even if,
  // in some edge case, they weren't in the Darwin-scoped `mentors` list
  // above).
  const excludedRows = rows.filter((r) => r.classification === "excluded_other_department" || r.classification === "excluded_non_department_team" || r.classification === "excluded_ops_managers");
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
  // countedInstructorRows is built from (see computeDepartmentAndExceptionRows
  // above), so every breakdown below (department, campus, manager,
  // deployment, payroll split, the click-to-expand instructor list, and the
  // CSV download) reflects it too.

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

  // Darwin-only / TeachOS-only / both-access split for the three Overview
  // KPI cards (2026-09-04, per request): cuts each category's own
  // already-computed population (countedInstructorRows / mentors /
  // opsTeamRows) a different way, by which source(s) actually have a
  // record for that person, and — per a follow-up request the same day —
  // includes the actual people in each of the nine resulting buckets (not
  // just counts), so the dashboard can drill from a KPI card down to a
  // person list without a second endpoint. Note Mentors' teachos_only is
  // structurally always 0 today: classifyDepartment()
  // (departmentTaxonomy.ts) can only ever produce classification "mentor"
  // from a Darwin department string, so a TeachOS-only row (no Darwin
  // record at all) can never be classified as a mentor under the current
  // rules.
  const toAccessBucket = (list: InstructorRow[]) => ({
    count: list.length,
    people: list.map(summarize),
  });
  const buildAccessSplit = (list: InstructorRow[]) => ({
    darwin_only: toAccessBucket(list.filter((r) => r.inDarwin && !r.inTeachos)),
    both: toAccessBucket(list.filter((r) => r.inDarwin && r.inTeachos)),
    // "!r.inDarwin" alone, not "!r.inDarwin && r.inTeachos" -- the latter
    // used to be a safe, equivalent way to write "remainder" (darwin_only
    // plus both already cover every row where inDarwin is true, so the only
    // rows left for this bucket have inDarwin false, and until 2026-10-05
    // every list passed in here had an invariant guaranteeing inTeachos
    // true whenever inDarwin was false). exceptionRows just broke that
    // invariant on purpose (its own comment above): it can now contain a
    // row where BOTH inDarwin and inTeachos are false (someone who's fully
    // exited with no TeachOS record either). Written as "!r.inDarwin &&
    // r.inTeachos" that row would match none of these three buckets and
    // silently disappear from this split (and, since the Instructors tab's
    // whole table for a category is built by merging exactly these three
    // buckets -- see mergedPeople() in instructors.tsx -- from the
    // Exception tab's table too), even while still being counted in
    // exception_count below -- a count/table mismatch that reintroduces
    // the exact "disappears without being reviewed" bug this change set
    // out to fix. The other four lists passed through here (departmentRows/
    // countedInstructorRows/mentors/opsTeamRows) still can't ever produce a
    // both-false row, so dropping the "&& r.inTeachos" conjunct is a no-op
    // for them.
    teachos_only: toAccessBucket(list.filter((r) => !r.inDarwin)),
  });
  // departmentRows (the 4th "Instructor Department" Overview card --
  // Instructors + Mentors + Operations team together) and exceptionRows (the
  // Exception review queue carved out of it) are both already computed
  // above via computeDepartmentAndExceptionRows() -- see that function's own
  // comment for the full "who counts as an Exception" reasoning.

  // Exception 2 (Overview), 2026-10-07 -- two lists, plus the "date_of_exit"
  // column. date_of_exit comes ONLY from the Darwinbox exit data's "Date Of
  // Exit" (last working day, stored on the row as exitLastWorkingDate) --
  // 2026-10-07, per request. The separate "Exit Date" (when the request was
  // raised) stays in the exit_date column.
  //   * Exit list: reviewed Exited/Absconded and still in TeachOS -- their
  //     TeachOS access should be removed -- PLUS anyone reviewed as Serving
  //     Notice Period whose exit date is before today (IST), i.e. the notice
  //     period finished yesterday or earlier ("once the date of exit is done,
  //     the next day all the serving notice instructors move to the exit
  //     list"). They only join it while still in TeachOS.
  //   * Serving notice list: everyone reviewed as Serving Notice Period whose
  //     exit date has not passed yet (or the exit data has none for them, so
  //     there is nothing to move them on).
  const todayIst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const exitDateOf = (r: InstructorRow) => (r.classification === "payroll_converted" ? r.manualExitDate : r.exitLastWorkingDate) ?? null;
  const noticeEnded = (r: InstructorRow) => { const d = exitDateOf(r); return !!d && d < todayIst; };
  // A resignation still "Pending With Approver" with NO date of exit yet is not
  // an exit -- it stays in the Serving notice list only and is never added to
  // the Exit list (2026-10-07, per request), whatever its review label says.
  // (Payroll instructors are judged by their manual date alone.)
  const pendingWithoutExitDate = (r: InstructorRow) =>
    r.classification !== "payroll_converted" && (r.exitFlagStatus ?? "").trim().toLowerCase().startsWith("pending") && !exitDateOf(r);
  const exitListRows = [
    ...exceptionRemoveRows.filter((r) => !pendingWithoutExitDate(r)),
    ...servingNoticeRows.filter((r) => r.inTeachos && noticeEnded(r)),
  ];
  const noticeBase = servingNoticeRows.filter((r) => !noticeEnded(r));
  const noticeIds = new Set(noticeBase.map((r) => r.id));
  const noticeListRows = [...noticeBase, ...exceptionRemoveRows.filter((r) => pendingWithoutExitDate(r) && !noticeIds.has(r.id))];

  // Overview "Exception 3" (2026-10-08, per request): everyone whose exit approval is still
  // pending -- the action list for the HRBP. Same queue as Exception 1 (still in Darwin or
  // TeachOS, not payroll-converted, not filed under another team), narrowed to a latest exit
  // record whose status is "Pending With Approver". Review labels don't matter here: a person
  // stays on this list until Darwin shows the approval decision (it then leaves, or moves on
  // as Approved).
  // pendingApprovalRows comes from computeDepartmentAndExceptionRows above (it now also keeps payroll-converted people).

  const accessBreakdown = {
    department: buildAccessSplit(departmentRows),
    instructors: buildAccessSplit(countedInstructorRows),
    mentors: buildAccessSplit(mentors),
    // Instructors + Mentors combined (2026-10-06, per request) -- same two
    // lists the Instructor Department tab uses, minus the Operations team.
    instructors_mentors: buildAccessSplit([...countedInstructorRows, ...mentors]),
    ops_team: buildAccessSplit(opsTeamRows),
    exception: buildAccessSplit(exceptionRows),
    // Overview "Exception 2" (2026-10-06): reviewed as Exited/Absconded and still in TeachOS.
    exception_remove: buildAccessSplit(exitListRows),
    // Overview "Exception 2" Serving notice period list (2026-10-07).
    exception_notice: buildAccessSplit(noticeListRows),
    // Overview "Exception 3" (2026-10-08): exit approval still pending (HRBP action list).
    exception_pending: buildAccessSplit(pendingApprovalRows),
  };
  res.json({
    kpis: {
      // Instructors + Mentors + Operations team combined -- backs the
      // "Instructor Department" Overview card (see departmentRows above).
      department_total_count: departmentRows.length,
      total_instructor_count: countedInstructorRows.length,
      total_including_exited: instructorRows.length,
      exited_excluded_from_count: exitedInstructorRows.length,
      mentors_count: mentors.length,
      instructors_mentors_count: countedInstructorRows.length + mentors.length,
      excluded_count: excludedRows.length,
      ops_team_count: opsTeamRows.length,
      // Unreviewed-exit review queue (2026-09-18, per request) -- see
      // exceptionRows' comment above. Not additive with the counts above:
      // everyone here is already included in exactly one of
      // total_instructor_count/mentors_count/ops_team_count/
      // department_total_count.
      exception_count: exceptionRows.length,
      exception_remove_count: exitListRows.length,
      exception_notice_count: noticeListRows.length,
      exception_pending_count: pendingApprovalRows.length,
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
    other_department: otherDepartmentRows.map(summarize),
    // Flat list backing the click-to-expand details view under the total
    // instructor count card — every person counted in
    // kpis.total_instructor_count (Darwin's own instructor headcount plus
    // the TeachOS Payroll bucket — see comment above countedInstructorRows),
    // sorted by name.
    instructors: [...countedInstructorRows]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(summarize),
    access_breakdown: accessBreakdown,
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
  dept_area: normalizeSubjectArea(row.deptArea),
  classification: row.classification,
  classification_reason: row.classificationReason,
  notes: row.notes,
  // Darwin's Date of joining (2026-09-08, per request) -- added here since
  // this is what every Darwin Breakdown bucket (instructors/mentors/ops/
  // excluded/payroll-edge-case/uncategorized) serializes through.
  date_of_joining: row.dateOfJoining,
});

// The old "Exits" tab (added 2026-09-15) lived here -- GET /reports/exits +
// toApiExit(), everyone currently flagged as exited joined with their
// instructor record. Removed (2026-09-19, per request) now that "Darwin
// Exit Details" gives the fuller, joined-with-enrichment-reports picture of
// exited employees instead -- see GET /reports/darwin-exit-details above.

router.get("/reports/teachos-breakdown", requireAuth, requireRole("admin"), async (_req, res) => {
  const rows = (await db.select().from(instructorsTable)).filter((r) => r.inTeachos);

  // "other_department_manual" (2026-09-04): an individually-reviewed
  // OTHER_DEPARTMENT_EMPLOYEES override (classificationOverrides.ts) — this
  // person DOES match Darwin's Instructors department directly (so
  // structurally they'd land in matchedPrimaryRows below), but a human has
  // deliberately filed them under "Other department" instead. Carve them
  // out of the Darwin-match check on both sides so that human decision
  // wins regardless of the underlying inDarwin/inDarwinFullRoster flags.
  const isManualOtherDepartment = (r: InstructorRow) => r.classification === "other_department_manual";
  // IIT Kharagpur (broadened 2026-09-08, per request, see reconcile.ts):
  // institute_name === "IIT Kharagpur" now sets this classification
  // regardless of Darwin match, so — same as isManualOtherDepartment right
  // above — it has to carve someone out of the Darwin-match check on both
  // sides too, or a Darwin-matched IIT Kharagpur person (e.g. Siddhanth
  // Mosam, NW0002770: active in Darwin's Instructors – Gen AI department)
  // would stay stuck in matchedPrimaryRows/"matched_with_darwin" instead of
  // moving into "Other department" as intended.
  const isIitKharagpurTeam = (r: InstructorRow) => r.classification === "iit_kharagpur_team";
  const matchedPrimaryRows = rows.filter((r) => r.inDarwin && !r.inDarwinFullRoster && !isManualOtherDepartment(r) && !isIitKharagpurTeam(r));
  const notMappedRows = rows.filter((r) => !(r.inDarwin && !r.inDarwinFullRoster) || isManualOtherDepartment(r) || isIitKharagpurTeam(r));

  // `!isIitKharagpurTeam(r)` guards here too: without it, a full-roster-
  // fallback Darwin match (inDarwin && inDarwinFullRoster) whose institute is
  // also IIT Kharagpur would double-count in both otherDepartmentDarwinRows
  // and iitKharagpurRows below.
  const otherDepartmentDarwinRows = notMappedRows.filter((r) => r.inDarwin && r.inDarwinFullRoster && !isIitKharagpurTeam(r));
  const manualOtherDepartmentRows = notMappedRows.filter((r) => isManualOtherDepartment(r));
  // Pulled from notMappedRows directly, NOT from notInDarwinRows below —
  // an IIT Kharagpur person can now have inDarwin=true, so scoping this to
  // the not-in-Darwin pool (as it used to be, pre-2026-09-08) would miss
  // them entirely.
  const iitKharagpurRows = notMappedRows.filter((r) => isIitKharagpurTeam(r));
  const otherDepartmentRows = [...otherDepartmentDarwinRows, ...iitKharagpurRows, ...manualOtherDepartmentRows];
  // Excludes anyone already claimed by iitKharagpurRows above (relevant now
  // that an IIT Kharagpur person isn't necessarily !inDarwin anymore) so
  // excludedRows/payrollConvertedRows/needsReviewRows below can't double-
  // count them.
  const notInDarwinRows = notMappedRows.filter((r) => !r.inDarwin && !isIitKharagpurTeam(r));
  const excludedRows = notInDarwinRows.filter((r) => r.classification === "excluded_other_department" || r.classification === "excluded_non_department_team");
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
router.get("/reports/darwin-breakdown", requireAuth, requireRole("admin"), async (_req, res) => {
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

// Shared by the two dynamic-column raw tables below (Darwin Full Roster,
// Darwin Exit Details). collectDynamicColumns() walks every stored row's
// rawData in first-seen order, same as before; pinIdentityColumnsFirst()
// then guarantees Employee Id is always column 1 and Full Name column 2
// (2026-09-19, per request: "make sure that 1st column is employee_id and
// 2nd column is name") regardless of whatever order a given row's own
// fields happened to come in as -- both connectors already build their rows
// with Employee Id/Full Name first (see darwinbox.ts's and
// darwinboxExits.ts's ALIASES), so this is normally a no-op, but pinning it
// explicitly here means a legacy row, a manually-uploaded full-roster CSV
// with its own column order, or a future connector change can never quietly
// knock these two out of place.
function collectDynamicColumns(stored: { rawData: unknown }[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const r of stored) {
    for (const key of Object.keys((r.rawData as Record<string, unknown>) ?? {})) {
      if (!seen.has(key)) { seen.add(key); columns.push(key); }
    }
  }
  return columns;
}

function pinIdentityColumnsFirst(columns: string[]): string[] {
  // Department and its Head of Department right after the name (2026-10-22, per request).
  const priority = ["Employee Id", "Full Name", "Department", "Head of Department"];
  const present = priority.filter((name) => columns.includes(name));
  const rest = columns.filter((name) => !priority.includes(name));
  return [...present, ...rest];
}

// Raw browse of Darwin's FULL, unfiltered company roster (2026-09-18, per
// follow-up request -- replaces an earlier classified-breakdown version of
// this same tab: "I don't need any breakdown there, I just want to see the
// whole darwin data, 3K+ data should be visible there"). No reconciliation,
// no bucketing, no scoping to whoever happens to also be a current TeachOS
// instructor -- literally every row Darwinbox's Master API returned on the
// last sync (~3,300+, per the darwinbox.ts header comment), straight out of
// the darwinbox_full_roster table. Column set is derived from whichever
// keys are actually present across the stored rows (first-seen order)
// rather than a hardcoded list, so this never silently drops a field if
// darwinbox.ts's ALIASES list changes later -- in practice this is exactly
// the 15 canonical columns mapRecordToRow() maps every record through (see
// connectors/darwinbox.ts): Employee Id, Full Name, Org Email Id, Primary
// Mobile Number, Date Of Joining, Department, Designation, Direct Manager,
// Work Location, Workspace, Gender, Employee Status, Date Of Exit, Current
// State, Current City. No new data pipeline needed -- fetchDarwinRowsBoth()
// already fetches this full roster alongside the primary Instructors-
// department pull on every Darwin sync (scheduled or manual "Sync now") and
// every manual full-roster CSV upload (see routes/uploads.ts); this route
// just surfaces what's already being kept current.
router.get("/reports/darwin-full-roster", requireAuth, requireRole("admin"), async (_req, res) => {
  const stored = await db.select().from(darwinboxFullRosterTable).orderBy(darwinboxFullRosterTable.id);

  const columns: string[] = pinIdentityColumnsFirst([...new Set([...collectDynamicColumns(stored), "Head of Department"])]);
  const rows = stored.map((r) => {
    const data = r.rawData as Record<string, unknown>;
    const row: Record<string, unknown> = {};
    for (const key of columns) row[key] = data[key] ?? null;
    return row;
  });
  // Head of Department WORKED OUT FROM THE REPORTING LINE (2026-10-22, per request: Darwin sends no HOD field, so the column was empty).
  // For each employee, follow Direct Manager upwards while the manager is in the SAME department; the last person reached is that
  // department's head for this employee (the one whose own manager sits in another department). Someone at the top of their own
  // department is their own HOD. Managers are found by the employee id inside "Direct Manager" (e.g. "Name (NW0001234)"), else by
  // exact name. A value Darwin sends itself (if any) is kept.
  {
    const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
    const byId = new Map<string, Record<string, unknown>>();
    const byName = new Map<string, Record<string, unknown> | null>();
    for (const row of rows) {
      const id = s(row["Employee Id"]).toUpperCase();
      if (id) byId.set(id, row);
      const n = s(row["Full Name"]).toLowerCase();
      if (n) byName.set(n, byName.has(n) ? null : row); // a name shared by two people is not used
    }
    const managerOf = (row: Record<string, unknown>) => {
      const dm = s(row["Direct Manager"]);
      if (!dm) return undefined;
      const id = dm.match(/NW\d{7}/i)?.[0]?.toUpperCase();
      if (id && byId.has(id)) return byId.get(id);
      const name = dm.replace(/\(.*?\)|NW\d{7}/gi, "").replace(/[-|,]+$/, "").trim().toLowerCase();
      return byName.get(name) ?? undefined;
    };
    for (const row of rows) {
      if (s(row["Head of Department"])) continue;
      const dept = s(row["Department"]);
      if (!dept) continue;
      let cur = row;
      const seen = new Set<Record<string, unknown>>([row]);
      for (;;) {
        const mgr = managerOf(cur);
        if (!mgr || seen.has(mgr) || s(mgr["Department"]) !== dept) break;
        seen.add(mgr);
        cur = mgr;
      }
      row["Head of Department"] = `${s(cur["Full Name"])}${s(cur["Employee Id"]) ? ` (${s(cur["Employee Id"])})` : ""}`;
    }
  }

  res.json({
    count: rows.length,
    columns,
    rows,
    synced_at: stored[0]?.syncedAt ?? null,
  });
});

// Darwin Exit Details (2026-09-19, per request: "the darwin data report id
// that we are using is limited to few details of data only ... for each
// employee_id ... pull other data from other new report Id"). The Exits
// tab above only ever shows Employee Id/Full Name/Exit Date/Reason/Status,
// because that's all DBX_CHECK_REPORT_ID's own report returns. This route
// surfaces the FULL joined record instead -- every field darwinboxExits.ts
// merged in from DBX_CHECK_ENRICH_REPORT_IDS (config.ts) on top of the base
// 5, straight from darwinboxExitsTable.rawData, columns derived dynamically
// same as darwin-full-roster above rather than hardcoded, since which
// fields those enrichment reports actually carry isn't fixed ahead of time.
//
// Scoping history: this route has gone back and forth between "every exit,
// company-wide" and "Instructor-team departments only" several times (see
// git history/prior comments here for the department-matching heuristics
// that were tried and discarded along the way). Reverted once more, this
// time for good (2026-09-27, per request: "we are going to remove all the
// tables that we have right now ... load all the 3,000+ data that we have
// for total companies") -- every department's exit records, unfiltered,
// same as darwin-full-roster's philosophy above. The instructor-team
// allowlist/regex matching and the department_breakdown diagnostic table
// that existed purely to sanity-check that filter are removed along with
// it -- there's no longer a filter to diagnose.
router.get("/reports/darwin-exit-details", requireAuth, requireRole("admin"), async (_req, res) => {
  const allStored = await db.select().from(darwinboxExitsTable).orderBy(darwinboxExitsTable.id);

  // Show every exit record, unfiltered (2026-09-29, per request: "get all
  // this data ... in table -- right now we are not showing the data of
  // revoked ... i what all the data, revoked, rejected, approved, pending
  // for approval"). Previously this route silently dropped any row whose
  // Status was "Revoked" (a resignation that was cancelled/withdrawn, so
  // the person never actually exited) -- that's no longer the case; every
  // row Darwinbox's exits report returned is shown, same "show everything"
  // philosophy as darwin-full-roster. Instead, each row now carries an
  // explicit exit_status_category derived from that same Status field, so
  // the frontend can label/filter each category separately rather than one
  // silently vanishing.
  //
  // Categorization confirmed against real live data (2026-09-29, via a
  // one-off distinct-values check): the raw Status field's actual values
  // are "Approved" (3368), "Revoked" (375), "Rejected" (71), "Pending With
  // Approver" (26), "Admin Approved" (8), and "Revoked via Revoke Approval
  // Flow" (3) -- six exact strings across what are really four business
  // categories, matched by substring so a wording variant (e.g. "Admin
  // Approved", "Revoked via Revoke Approval Flow") still lands in the
  // right bucket. "other" is a deliberate catch-all for any future/unknown
  // Status value so a new one is never silently dropped from the counts.
  const stored = allStored;
  const exitStatusCategory = (r: typeof allStored[number]): "revoked" | "rejected" | "pending" | "approved" | "other" => {
    const rawData = r.rawData as Record<string, unknown> | null;
    const status = (rawData ? cell(rawData, "Status") : null)?.toLowerCase() ?? "";
    if (status.includes("revoked")) return "revoked";
    if (status.includes("rejected")) return "rejected";
    if (status.includes("pending")) return "pending";
    if (status.includes("approved")) return "approved";
    return "other";
  };

  // Exception flag (2026-09-27, per request: "can you keep this exception
  // filter in the darwin exit tab that will help get the records of
  // exceptions") -- flags which of the rows above belong to someone
  // currently sitting in the Instructors tab's Exception review queue (see
  // computeDepartmentAndExceptionRows above for the full "who counts as an
  // Exception" reasoning).
  //
  // Employee ID ONLY (2026-09-27, changed same day per follow-up request:
  // "only map the instructors with the same employee id not the names").
  // This briefly also matched by normalized full name (to close a reported
  // "41 of 50" undercount), but cross-checking the two tabs' CSVs against
  // each other turned up real false positives from that: several currently
  // active instructors were being counted as Exceptions here purely because
  // an unrelated former employee happened to share their exact full name
  // (different employee ID, a genuinely different person who'd already
  // exited). findExit() (reconcile.ts) was changed the same way for the
  // same reason -- exitFlag itself is now employee-ID-only too, so this
  // route's join and the Instructors tab's Exception queue stay consistent
  // with each other, both keyed on employee ID alone.
  // Uses the full queue (including people reviewed as Exited/Absconded who still
  // need removing), not just the narrowed Instructors-tab Exception view.
  const { exceptionQueueRows } = computeDepartmentAndExceptionRows(await db.select().from(instructorsTable));
  const exceptionEmployeeIds = new Set(exceptionQueueRows.map((r) => r.employeeId).filter((id): id is string => !!id));

  // "Current Department" dropped from this table's display (2026-09-26, per
  // request: "remove the current department table that we have") -- it's
  // still read from rawData elsewhere (reconcile.ts's payroll-converted
  // department/designation fix), just no longer shown as its own column
  // here.
  const columns: string[] = pinIdentityColumnsFirst(collectDynamicColumns(stored)).filter((column) => column !== "Current Department");
  const rows = stored.map((r) => {
    const data = r.rawData as Record<string, unknown>;
    const row: Record<string, unknown> = {};
    for (const key of columns) row[key] = data[key] ?? null;
    row.is_exception = !!(r.employeeId && exceptionEmployeeIds.has(r.employeeId));
    row.exit_status_category = exitStatusCategory(r);
    return row;
  });

  res.json({
    count: rows.length,
    columns,
    rows,
    synced_at: stored[0]?.syncedAt ?? null,
    total_exit_records: allStored.length,
    revoked_count: rows.filter((r) => r.exit_status_category === "revoked").length,
    rejected_count: rows.filter((r) => r.exit_status_category === "rejected").length,
    pending_count: rows.filter((r) => r.exit_status_category === "pending").length,
    approved_count: rows.filter((r) => r.exit_status_category === "approved").length,
    other_count: rows.filter((r) => r.exit_status_category === "other").length,
    exception_count: rows.filter((r) => r.is_exception).length,
  });
});

// Instructor Training Status ("Training Stats" tab, 2026-09-23, per
// request) -- an instructor's OWN training/upskilling progress, sourced
// from BigQuery's niat_instructor_unit_wise_completion_and_best_attempt_
// details (aggregated per course by fetchCourseStatusRows() and synced into
// instructorTrainingStatusTable via POST /sync/training-status, see
// routes/sync.ts). Distinct from every other report on this page, which
// tracks session-teaching activity, not the instructor's own coursework.
//
// Population (2026-09-23, per request: "we only going to extract data of
// the instructors and mentors only, depending on there employee id"):
// TeachOS-active rows (inTeachos, same base population /reports/instructors
// uses) whose classification isn't one of the excluded/ops/other-department
// buckets -- i.e. confirmed instructors, mentors, payroll-converted, and
// unclassified/normal rows, matching instructorRows + mentorRows combined
// from /reports/instructors above. Each person is identified by their own
// employee_id in the response, per that same request.
const TRAINING_STATS_EXCLUDED_CLASSIFICATIONS = new Set([
  "excluded_other_department",
  "excluded_non_department_team",
  "excluded_ops_managers",
  "instructor_ops",
  "iit_kharagpur_team",
  "other_department_manual",
]);

// Date of joining for the Contribution tab (2026-10-14, per request). Darwin's value comes first, with the
// same gating as the Instructors tab (the live dateOfJoining is only trusted while the person is matched in Darwin --
// reconcileDarwin() resets inDarwin but leaves the old date behind); then the date archived while they were in Darwin; then a date
// typed in by hand (instructor_manual_joining, for payroll-converted people Darwin has no date for). Only two long-standing archive
// columns are selected, and the manual table is read defensively, so a database that has not been pushed yet cannot break these pages.
type JoiningSource = "darwin" | "exit" | "archive" | "manual";
// Date of Joining off a Darwin exit record (2026-10-15, per request: payroll-converted instructors have left the Darwin roster but their
// exit record still carries it). The header is matched loosely -- "Date Of Joining", "Date of Joining", "DOJ", "Joining Date" -- and the
// value read in whatever format Darwin sent; the newest record (highest id) with a usable date wins. Future / pre-1990 values are ignored.
const JOINING_HEADERS = new Set(["dateofjoining", "doj", "joiningdate", "dateofjoin", "dateofjoiningdoj"]);
function joiningDateOfExitRecord(rawData: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(rawData)) {
    if (value === null || value === undefined) continue;
    if (!JOINING_HEADERS.has(key.toLowerCase().replace(/[^a-z]/g, ""))) continue;
    const iso = toISODate(String(value).trim());
    if (iso && iso >= "1990-01-01" && iso <= new Date().toISOString().slice(0, 10)) return iso;
  }
  return null;
}
async function loadJoiningLookups() {
  const archived = await db.select({ employeeId: instructorArchiveTable.employeeId, dateOfJoining: instructorArchiveTable.dateOfJoining }).from(instructorArchiveTable);
  const archiveByEmployeeId = new Map<string, string>(archived.filter((a) => a.employeeId && a.dateOfJoining).map((a) => [a.employeeId!, a.dateOfJoining!]));
  let manualByEmployeeId = new Map<string, string>();
  const exitByEmployeeId = new Map<string, string>();
  try {
    const exits = await db.select({ id: darwinboxExitsTable.id, employeeId: darwinboxExitsTable.employeeId, rawData: darwinboxExitsTable.rawData }).from(darwinboxExitsTable);
    const newest = new Map<string, number>();
    for (const x of exits) {
      if (!x.employeeId) continue;
      const iso = joiningDateOfExitRecord(x.rawData);
      if (iso && x.id > (newest.get(x.employeeId) ?? -1)) { newest.set(x.employeeId, x.id); exitByEmployeeId.set(x.employeeId, iso); }
    }
  } catch (err) {
    console.warn("[joining] could not read the exit data for joining dates:", (err as Error).message);
  }
  try {
    const manual = await db.select().from(instructorManualJoiningTable);
    manualByEmployeeId = new Map(manual.map((m) => [m.employeeId, m.dateOfJoining]));
  } catch (err) {
    console.warn("[joining] instructor_manual_joining is not readable yet (run the database push):", (err as Error).message);
  }
  return { archiveByEmployeeId, manualByEmployeeId, exitByEmployeeId };
}
function resolveJoining(p: typeof instructorsTable.$inferSelect, lookups: Awaited<ReturnType<typeof loadJoiningLookups>>): { date: string | null; source: JoiningSource | null } {
  if (p.inDarwin && p.dateOfJoining) return { date: p.dateOfJoining, source: "darwin" };
  const fromExit = p.employeeId ? lookups.exitByEmployeeId.get(p.employeeId) : undefined;
  if (fromExit) return { date: fromExit, source: "exit" };
  const archived = p.employeeId ? lookups.archiveByEmployeeId.get(p.employeeId) : undefined;
  if (archived) return { date: archived, source: "archive" };
  const manual = p.employeeId ? lookups.manualByEmployeeId.get(p.employeeId) : undefined;
  if (manual) return { date: manual, source: "manual" };
  return { date: null, source: null };
}

router.get("/reports/training-stats", requireAuth, requireRole("admin"), async (_req, res) => {
  const allRows = await db.select().from(instructorsTable);
  const people = allRows
    .filter((r) => r.inTeachos && !TRAINING_STATS_EXCLUDED_CLASSIFICATIONS.has(r.classification ?? ""))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const statusRows = await db.select().from(instructorTrainingStatusTable);
  // NIAT cohort per instructor (2026-10-17, per request) -- the same Contribution column -- so the Training tab can tell which semester
  // each person teaches now (NIAT 2026 = Sem 1, 2025 = Sem 3, 2024 = Sem 5) and how ready they are for the next one.
  const cohortRows = await db.select({ id: instructorContributionTable.instructorUserId, niatCohorts: instructorContributionTable.niatCohorts }).from(instructorContributionTable);
  const cohortsByTeachosId = new Map(cohortRows.map((c) => [c.id, c.niatCohorts]));
  // instructor_user_id (BigQuery's own hex ID) -> courseKey -> that row.
  // Joined here, at read time, against instructorsTable.teachosUserId --
  // the same key reconcileCapabilityManager() already uses to match this
  // exact BigQuery ID to an instructor record (see lib/reconcile.ts) -- no
  // separate reconcile/matching step was needed for this sync.
  const byInstructor = new Map<string, Map<string, (typeof statusRows)[number]>>();
  for (const row of statusRows) {
    if (!byInstructor.has(row.instructorUserId)) byInstructor.set(row.instructorUserId, new Map());
    byInstructor.get(row.instructorUserId)!.set(row.courseKey, row);
  }

  const rows = people.map((p) => {
    const courseStatuses = p.teachosUserId ? byInstructor.get(p.teachosUserId) : undefined;
    const hasTrainingData = !!courseStatuses;
    const courses: Record<string, string> = {};
    // Share of the course's units completed, 0-100 (2026-10-14, per request: show how far an In Progress course is). Only
    // for courses the instructor has real rows for; units_completed / units_total from the training sync.
    const courseProgress: Record<string, number> = {};
    for (const def of TRAINING_COURSE_TAXONOMY) {
      if (!isResolvedCourse(def)) {
        // No confident course_title mapping yet -- see
        // trainingCourseTaxonomy.ts and Instructor_Learning_Status_Course_
        // Mapping_Review.xlsx. Uniform across every instructor, not
        // per-person data.
        courses[def.key] = "PENDING_MAPPING";
      } else if (!hasTrainingData) {
        // Distinct from NOT_STARTED: this instructor has no BigQuery
        // training-status rows at all (never synced, or their
        // teachos_user_id hasn't matched anything in that table), so there's
        // no basis to say they haven't started -- vs. genuinely having
        // course rows that are all YET_TO_START.
        courses[def.key] = "NO_DATA";
      } else {
        const rec = courseStatuses!.get(def.key);
        courses[def.key] = rec?.status ?? "NOT_STARTED";
        if (rec && rec.unitsTotal > 0) courseProgress[def.key] = Math.round((rec.unitsCompleted / rec.unitsTotal) * 1000) / 10;
      }
    }
    return {
      employee_id: p.employeeId,
      full_name: p.fullName,
      department: p.department,
      capability_manager: p.teachosManager || p.manualCapabilityManager || null,
      classification: p.classification,
      // Added 2026-09-24, per request ("if I'm trying to open only tech, to
      // only see the tech-related instructors") -- same computed-then-manual
      // fallback pattern as dept_area on /reports/instructors (toApiInstructorSummary),
      // used by the frontend to filter WHICH ROWS show on each of the Tech /
      // Math and Aptitude / English sub-tabs. null means classifyDepartment()
      // couldn't resolve an area for this person (e.g. a flat "Mentors"
      // department string with no sub-area, or missing Darwin data) -- they
      // won't appear on any of the 3 subject tabs until a human fills in
      // Manual Subject for them (same PATCH /instructors/:id/subject path
      // the Instructors tab already uses).
      subject_area: normalizeSubjectArea(p.deptArea || p.manualDeptArea || null),
      product: productOf(p),
      has_training_data: hasTrainingData,
      courses,
      course_progress: courseProgress,
      niat_cohorts: p.teachosUserId ? (cohortsByTeachosId.get(p.teachosUserId) ?? []) : [],
    };
  });

  res.json({
    taxonomy: TRAINING_COURSE_TAXONOMY,
    // Hands the frontend the authoritative "which areas count as Tech" list
    // (see TECH_AREAS in departmentTaxonomy.ts) instead of it hardcoding a
    // copy that could drift out of sync.
    tech_areas: TECH_AREAS,
    count: rows.length,
    rows,
    synced_at: statusRows[0]?.syncedAt ?? null,
  });
});

// "Taught in class" training, SESSION-ID version (2026-10-19, per request): NIAT instructors only (Product NIAT (Deployed), and their
// TeachOS enrolled plan NIAT when one is recorded). For every course they teach: curriculum = distinct Lecture/Practice session ids of
// that course at their NIAT institutes; completed = the distinct ones they completed; % = completed / curriculum (see
// connectors/taughtTraining.ts, built by the Training Status sync). The page shows one subject at a time (Frontend, Backend, DSA...),
// its courses as columns and one row per instructor. Course -> subject is worked out here (taughtSubjectColumn: by id, else by title;
// orientation/intro courses left out), so changing it needs no re-sync. Completed = 80%+. Admin-only. Reads defensively.
const TAUGHT_COMPLETED_PCT = 80;
const NON_TECH_TAUGHT_SUBJECTS = new Set(["English", "Aptitude", "Maths"]);
const isNiatInstructor = (p: typeof instructorsTable.$inferSelect) =>
  productOf(p) === "NIAT (Deployed)" && (!p.enrolledPlans || /niat/i.test(p.enrolledPlans));
router.get("/reports/taught-training", requireAuth, requireRole("admin"), async (_req, res) => {
  const allRows = await db.select().from(instructorsTable);
  const people = allRows.filter((r) => r.inTeachos && r.teachosUserId && !TRAINING_STATS_EXCLUDED_CLASSIFICATIONS.has(r.classification ?? "") && isNiatInstructor(r));
  const byUid = new Map(people.map((p) => [p.teachosUserId!, p]));
  let taughtRows: (typeof instructorTaughtCourseTable.$inferSelect)[] = [];
  try {
    taughtRows = await db.select().from(instructorTaughtCourseTable);
  } catch (err) {
    console.warn("[taught-training] instructor_taught_course is not readable yet (run the database push):", (err as Error).message);
  }
  const pct = (done: number, total: number) => (total > 0 ? Math.min(100, Math.round((done / total) * 1000) / 10) : 0);
  type Cell = { completed: number; curriculum: number; scheduled: number; pct: number; last_taught_date: string | null; institutes: string[]; taught_as: string[] };
  const courses = new Map<string, { course_id: string; title: string; subject: string; instructors: number; curriculum_max: number; portal: boolean; order: number; taught_as: string[] }>();
  const cellsByUid = new Map<string, Record<string, Cell>>();
  for (const t of taughtRows) {
    if (!byUid.has(t.instructorUserId) || t.curriculumSessions <= 0) continue;
    // Only learning-portal courses are shown (2026-10-22, per request: campus-only courses are not shown here).
    if (!t.portalCourseKey) continue;
    // Column (2026-10-19, per request: "first get the courses we have in the learning portal, map what instructors teach in the campus
    // to those courses"): the learning-portal course whose topics this course's sessions match (portalCourseKey, set by the sync), so
    // every campus / version of a course lands in ONE column. Courses that match no portal course keep their own column (by name).
    const portal = portalColumnOf(t.portalCourseKey ?? null);
    const named = courseColumnOf(t.courseId, t.courseTitle);
    const key = portal?.key ?? named.key;
    // Courses of the lecture list that are not on the Training Stats list carry their own subject (2026-10-26).
    const subject = portal?.subject ?? t.courseSubject ?? taughtSubjectColumn(t.courseId, t.courseTitle)!;
    // Tech / non-tech split (2026-10-26, per request): an instructor whose subject is English, Aptitude or Maths is shown only under
    // the non-tech subjects, and a tech instructor (Frontend / Backend / DSA / GenAI) only under the tech ones. Someone with no subject
    // on file is shown everywhere they taught.
    const area = normalizeSubjectArea(byUid.get(t.instructorUserId)!.deptArea || byUid.get(t.instructorUserId)!.manualDeptArea || null);
    if (area && NON_TECH_TAUGHT_SUBJECTS.has(area) !== NON_TECH_TAUGHT_SUBJECTS.has(subject)) continue;
    if (!cellsByUid.has(t.instructorUserId)) cellsByUid.set(t.instructorUserId, {});
    const cells = cellsByUid.get(t.instructorUserId)!;
    const prev = cells[key];
    const completed = (prev?.completed ?? 0) + t.completedSessions, curriculum = (prev?.curriculum ?? 0) + t.curriculumSessions;
    const lastDate = [prev?.last_taught_date, t.lastTaughtDate].filter((d): d is string => !!d).sort().pop() ?? null;
    cells[key] = { completed, curriculum, scheduled: (prev?.scheduled ?? 0) + t.scheduledSessions, pct: pct(completed, curriculum), last_taught_date: lastDate,
      institutes: [...new Set([...(prev?.institutes ?? []), ...t.institutes])], taught_as: [...new Set([...(prev?.taught_as ?? []), ...(t.taughtTopics ?? [])])] };
    // Courses of the lecture list that are not on the Training Stats list follow the lecture list's order (2026-10-26, per request:
    // in DSA, "DSA (C++)" first, then "DSA II").
    const lectureIdx = t.courseId.startsWith("lecture:") ? LECTURE_COURSES.findIndex((c) => c.key === t.courseId.slice("lecture:".length)) : -1;
    const order = portal ? TRAINING_COURSE_TAXONOMY.findIndex((d) => `portal:${d.key}` === key) : 10000 + (lectureIdx >= 0 ? lectureIdx : 999);
    const c = courses.get(key) ?? { course_id: key, title: (t.courseId.startsWith("lecture:") ? t.courseTitle : portal?.title) ?? named.title, subject, instructors: 0, curriculum_max: 0, portal: !!portal, order, taught_as: [] };
    if (!prev) c.instructors += 1;
    c.curriculum_max = Math.max(c.curriculum_max, curriculum);
    for (const name of t.taughtTopics ?? []) if (!c.taught_as.includes(name)) c.taught_as.push(name);
    courses.set(key, c);
  }
  // Hide instructors with nothing taught (2026-10-26, per request): someone whose every course is at 0% (no completed lecture) is not
  // shown. If they have completed lectures in at least one course they are shown, with all their courses. Course head counts and
  // columns are recounted from the people who remain.
  for (const [uid, cells] of [...cellsByUid]) if (!Object.values(cells).some((c) => c.completed > 0)) cellsByUid.delete(uid);
  for (const c of courses.values()) c.instructors = 0;
  for (const cells of cellsByUid.values()) for (const key of Object.keys(cells)) { const c = courses.get(key); if (c) c.instructors += 1; }
  for (const [key, c] of [...courses]) if (!c.instructors) courses.delete(key);
  const rows = [...cellsByUid].map(([uid, cells]) => {
    const p = byUid.get(uid)!;
    return {
      employee_id: p.employeeId,
      full_name: p.fullName,
      subject_area: normalizeSubjectArea(p.deptArea || p.manualDeptArea || null),
      capability_manager: p.teachosManager || p.manualCapabilityManager || null,
      courses: cells,
    };
  }).sort((a, b) => a.full_name.localeCompare(b.full_name));
  res.json({
    rows,
    // Courses in subject order, then most-taught first.
    // Learning-portal courses first, in the Training Stats order; unmatched courses after them, most-taught first.
    courses: [...courses.values()].sort((a, b) => TAUGHT_SUBJECT_COLUMNS.indexOf(a.subject as (typeof TAUGHT_SUBJECT_COLUMNS)[number]) - TAUGHT_SUBJECT_COLUMNS.indexOf(b.subject as (typeof TAUGHT_SUBJECT_COLUMNS)[number]) || a.order - b.order || b.instructors - a.instructors || a.title.localeCompare(b.title)),
    subject_columns: TAUGHT_SUBJECT_COLUMNS,
    completed_pct: TAUGHT_COMPLETED_PCT,
    synced_at: taughtRows[0]?.syncedAt ?? null,
  });
});

// "Demos" view of Training Stats (2026-10-28, per request): next to "Taught in class", per instructor and lecture-list course -- how many
// of the course's lectures they have recorded a completed DEMO on (e.g. 8 of HTML & CSS's 20), and the average QA score (0-10) of all
// those demos. 2026-10-29, per request: beside it, the same for AI assessments (number of assessments, lectures covered, average score).
// Built by the Training Status sync (connectors/demoTraining.ts). People: NIAT Deployed AND NIAT Training instructors (per request), each
// row says which. Same tech / non-tech rule as Taught in class. Each cell: { demo: Stat | null, ai: Stat | null }.
const DEMO_PRODUCTS = new Set(["NIAT (Deployed)", "NIAT (Training)"]);
router.get("/reports/demo-training", requireAuth, requireRole("admin"), async (_req, res) => {
  const allRows = await db.select().from(instructorsTable);
  const people = allRows.filter((r) => r.inTeachos && r.teachosUserId && !TRAINING_STATS_EXCLUDED_CLASSIFICATIONS.has(r.classification ?? "") && DEMO_PRODUCTS.has(productOf(r)));
  const byUid = new Map(people.map((p) => [p.teachosUserId!, p]));
  let demoRows: (typeof instructorDemoCourseTable.$inferSelect)[] = [];
  try {
    demoRows = await db.select().from(instructorDemoCourseTable);
  } catch (err) {
    console.warn("[demo-training] instructor_demo_course is not readable yet (run the database push):", (err as Error).message);
  }
  type Stat = { covered: number; total: number; count: number; avg_score: number | null; scored: number; score_sum: number; last_date: string | null };
  type Cell = { demo: Stat | null; ai: Stat | null };
  const courses = new Map<string, { course_id: string; title: string; subject: string; demo_instructors: number; ai_instructors: number; total: number; order: number }>();
  const cellsByUid = new Map<string, Record<string, Cell>>();
  for (const t of demoRows) {
    const person = byUid.get(t.instructorUserId);
    if (!person || t.lecturesDemoed <= 0) continue;
    const area = normalizeSubjectArea(person.deptArea || person.manualDeptArea || null);
    if (area && NON_TECH_TAUGHT_SUBJECTS.has(area) !== NON_TECH_TAUGHT_SUBJECTS.has(t.courseSubject)) continue;
    const kind: "demo" | "ai" = t.evaluationKind === "ai" ? "ai" : "demo";
    const key = `demo:${t.courseKey}`;
    const cells = cellsByUid.get(t.instructorUserId) ?? {};
    const cell = cells[key] ?? { demo: null, ai: null };
    cell[kind] = { covered: t.lecturesDemoed, total: t.lecturesTotal, count: t.demos, scored: t.scored, score_sum: t.scoreSum,
      avg_score: t.scored > 0 ? Math.round((t.scoreSum / t.scored) * 10) / 10 : null, last_date: t.lastDemoDate };
    cells[key] = cell;
    cellsByUid.set(t.instructorUserId, cells);
    const c = courses.get(key) ?? { course_id: key, title: t.courseTitle, subject: t.courseSubject, demo_instructors: 0, ai_instructors: 0, total: t.lecturesTotal,
      order: LECTURE_COURSES.findIndex((x) => x.key === t.courseKey) };
    if (kind === "demo") c.demo_instructors += 1; else c.ai_instructors += 1;
    courses.set(key, c);
  }
  const rows = [...cellsByUid].map(([uid, cells]) => {
    const p = byUid.get(uid)!;
    return {
      employee_id: p.employeeId,
      full_name: p.fullName,
      product: productOf(p),
      subject_area: normalizeSubjectArea(p.deptArea || p.manualDeptArea || null),
      capability_manager: p.teachosManager || p.manualCapabilityManager || null,
      courses: cells,
    };
  }).sort((a, b) => a.full_name.localeCompare(b.full_name));
  res.json({
    rows,
    courses: [...courses.values()].sort((a, b) => TAUGHT_SUBJECT_COLUMNS.indexOf(a.subject as (typeof TAUGHT_SUBJECT_COLUMNS)[number]) - TAUGHT_SUBJECT_COLUMNS.indexOf(b.subject as (typeof TAUGHT_SUBJECT_COLUMNS)[number]) || a.order - b.order),
    subject_columns: TAUGHT_SUBJECT_COLUMNS,
    synced_at: demoRows[0]?.syncedAt ?? null,
  });
});

// Manual Date of joining (2026-10-14, per request): sets or clears the typed-in joining date for someone Darwin has no date for
// (payroll-converted instructors). Admin-only like the rest of the Contribution tab. Body: { employee_id, date_of_joining: "YYYY-MM-DD" | null }.
router.put("/reports/instructor-contribution/joining-date", requireAuth, requireRole("admin"), async (req, res) => {
  const body = req.body as { employee_id?: unknown; date_of_joining?: unknown };
  const employeeId = typeof body.employee_id === "string" ? body.employee_id.trim() : "";
  if (!employeeId) { res.status(400).json({ error: "employee_id is required" }); return; }
  const [person] = await db.select({ id: instructorsTable.id }).from(instructorsTable).where(eq(instructorsTable.employeeId, employeeId)).limit(1);
  if (!person) { res.status(404).json({ error: "No instructor with that employee id" }); return; }
  if (body.date_of_joining === null) {
    await db.delete(instructorManualJoiningTable).where(eq(instructorManualJoiningTable.employeeId, employeeId));
    res.json({ employee_id: employeeId, date_of_joining: null });
    return;
  }
  const day = typeof body.date_of_joining === "string" ? body.date_of_joining : "";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(`${day}T00:00:00Z`) : NaN;
  if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== day) { res.status(400).json({ error: "date_of_joining must be a real date as YYYY-MM-DD, or null to clear it" }); return; }
  if (parsed > Date.now() + 86400000) { res.status(400).json({ error: "date_of_joining cannot be in the future" }); return; }
  await db.insert(instructorManualJoiningTable).values({ employeeId, dateOfJoining: day }).onConflictDoUpdate({ target: instructorManualJoiningTable.employeeId, set: { dateOfJoining: day, updatedAt: new Date() } });
  res.json({ employee_id: employeeId, date_of_joining: day });
});

// Instructor Contribution ("Contribution" tab, 2026-09-24, per request):
// actual session-teaching hours delivered, sourced from BigQuery's
// niat_instructor_session_schedule_details (aggregated per instructor by
// fetchContributionRows() and synced into instructorContributionTable via
// POST /sync/instructor-contribution, see routes/sync.ts). Replaces the
// manual Contribution sheet Ankush previously uploaded.
//
// Same population as Training Stats above -- TeachOS-active, not one of the
// excluded/ops/other-department buckets, i.e. Instructors AND Mentors
// together ("create a new tab for employee contribution, where we have
// data of instructors as well mentor data there") -- reuses
// TRAINING_STATS_EXCLUDED_CLASSIFICATIONS since the population rule is
// identical, just for a different metric.
// Date filter (2026-10-12, per request): optional ?from=YYYY-MM-DD&to=YYYY-MM-DD (either may be given). When present,
// hours and session counts are totalled from the per-day table (instructorContributionDailyTable) for that inclusive
// range; with no range it is the all-time aggregate as before. Batches and NIAT cohort stay all-time / last-30-days.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
router.get("/reports/instructor-contribution", requireAuth, requireRole("admin"), async (req, res) => {
  const fromParam = typeof req.query.from === "string" && ISO_DAY.test(req.query.from) ? req.query.from : null;
  const toParam = typeof req.query.to === "string" && ISO_DAY.test(req.query.to) ? req.query.to : null;
  const ranged = !!(fromParam || toParam);
  const allRows = await db.select().from(instructorsTable);
  // Instructor Department only (2026-10-16, per request: "why do we have instructors who are not part of instructor department, e.g. the
  // robotics team"). Before, anyone active in TeachOS without an excluded classification was listed, so TeachOS users from other Darwin
  // departments (Robotics etc.) showed up. Now a person must ALSO be in the Instructors tab's own Instructors or Mentors population
  // (computeDepartmentAndExceptionRows: Darwin Instructors-department tech/non-tech instructors, payroll / TeachOS-only instructors,
  // and Darwin mentors). The one edge case, Saumya Sunil Patil (NW0005068, CONFIRMED_INSTRUCTOR_DESPITE_FULL_ROSTER), is kept even
  // though her Darwin department does not match -- that function already counts her as an instructor.
  const { countedInstructorRows, mentors } = computeDepartmentAndExceptionRows(allRows);
  const departmentIds = new Set([...countedInstructorRows, ...mentors].map((r) => r.id));
  const people = allRows
    .filter((r) => r.inTeachos && departmentIds.has(r.id) && (isConfirmedDespiteFullRoster(r) || !TRAINING_STATS_EXCLUDED_CLASSIFICATIONS.has(r.classification ?? "")))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const contributionRows = await db.select().from(instructorContributionTable);
  const joiningLookups = await loadJoiningLookups();
  // Demo and AI-assessment recording time per instructor (2026-10-14, per request), totalled over the chosen date range or all-time.
  // Read defensively: if the table is not pushed / synced yet the two columns are simply empty and nothing else is affected.
  type EvalTotals = { demoSeconds: number; demoCount: number; aiSeconds: number; aiCount: number; demoScoreSum: number; demoScored: number; aiScoreSum: number; aiScored: number };
  const evaluationByInstructor = new Map<string, EvalTotals>();
  try {
    const evalConditions = [fromParam ? gte(instructorEvaluationDailyTable.sessionDate, fromParam) : undefined, toParam ? lte(instructorEvaluationDailyTable.sessionDate, toParam) : undefined].filter((c) => c !== undefined);
    const evalRows = await db.select().from(instructorEvaluationDailyTable).where(evalConditions.length ? and(...evalConditions) : undefined);
    for (const e of evalRows) {
      const t = evaluationByInstructor.get(e.instructorUserId) ?? { demoSeconds: 0, demoCount: 0, aiSeconds: 0, aiCount: 0, demoScoreSum: 0, demoScored: 0, aiScoreSum: 0, aiScored: 0 };
      if (e.evaluationType === "DEMO") { t.demoSeconds += e.seconds; t.demoCount += e.evaluations; t.demoScoreSum += e.scoreSum; t.demoScored += e.scored; } else { t.aiSeconds += e.seconds; t.aiCount += e.evaluations; t.aiScoreSum += e.scoreSum; t.aiScored += e.scored; }
      evaluationByInstructor.set(e.instructorUserId, t);
    }
  } catch (err) {
    console.warn("[contribution] demo / AI assessment hours are not readable yet (run the database push, then Sync Now):", (err as Error).message);
  }
  // Learning time per instructor (2026-10-15, per request), totalled over the chosen date range or all-time; read defensively.
  const timeSpentByInstructor = new Map<string, { seconds: number; days: number }>();
  try {
    const tsConditions = [fromParam ? gte(instructorTimeSpentDailyTable.activityDate, fromParam) : undefined, toParam ? lte(instructorTimeSpentDailyTable.activityDate, toParam) : undefined].filter((c) => c !== undefined);
    const tsRows = await db.select().from(instructorTimeSpentDailyTable).where(tsConditions.length ? and(...tsConditions) : undefined);
    for (const t of tsRows) {
      const cur = timeSpentByInstructor.get(t.instructorUserId) ?? { seconds: 0, days: 0 };
      cur.seconds += t.seconds;
      cur.days += 1;
      timeSpentByInstructor.set(t.instructorUserId, cur);
    }
  } catch (err) {
    console.warn("[contribution] learning hours are not readable yet (run the database push, then Sync Now):", (err as Error).message);
  }
  // instructor_user_id (BigQuery's own hex ID) -> that row. Joined here, at
  // read time, against instructorsTable.teachosUserId -- same key
  // reconcileCapabilityManager() and the Training Stats join above already
  // use, no separate reconcile/matching step needed for this sync either.
  const byInstructor = new Map<string, (typeof contributionRows)[number]>();
  for (const row of contributionRows) byInstructor.set(row.instructorUserId, row);

  // Per-instructor totals for the chosen range, summed from the per-day rows.
  type RangeTotals = { lectureMinutes: number; practiceMinutes: number; otherMinutes: number; lectureSessions: number; practiceSessions: number; otherSessions: number; days: number };
  const rangeByInstructor = new Map<string, RangeTotals>();
  if (ranged) {
    const conditions = [fromParam ? gte(instructorContributionDailyTable.sessionDate, fromParam) : undefined, toParam ? lte(instructorContributionDailyTable.sessionDate, toParam) : undefined].filter((c) => c !== undefined);
    const dailyRows = await db.select().from(instructorContributionDailyTable).where(and(...conditions));
    for (const d of dailyRows) {
      const t = rangeByInstructor.get(d.instructorUserId) ?? { lectureMinutes: 0, practiceMinutes: 0, otherMinutes: 0, lectureSessions: 0, practiceSessions: 0, otherSessions: 0, days: 0 };
      t.lectureMinutes += d.lectureMinutes; t.practiceMinutes += d.practiceMinutes; t.otherMinutes += d.otherMinutes;
      t.lectureSessions += d.lectureSessions; t.practiceSessions += d.practiceSessions; t.otherSessions += d.otherSessions;
      if (d.lectureSessions + d.practiceSessions + d.otherSessions > 0) t.days += 1; // one row per instructor per day; any completed session counts
      rangeByInstructor.set(d.instructorUserId, t);
    }
  }

  // Role by sessions uses the LAST 30 DAYS only (2026-10-17, per request), whatever date range is picked: completed Lecture sessions and
  // all completed sessions per instructor over the 30 days ending today (IST), from the per-day rows.
  const last30ByInstructor = new Map<string, { lecture: number; total: number }>();
  try {
    const istToday = new Date(Date.now() + 5.5 * 3600 * 1000);
    istToday.setUTCDate(istToday.getUTCDate() - 29);
    const last30From = istToday.toISOString().slice(0, 10);
    for (const d of await db.select({ id: instructorContributionDailyTable.instructorUserId, lecture: instructorContributionDailyTable.lectureSessions, practice: instructorContributionDailyTable.practiceSessions, other: instructorContributionDailyTable.otherSessions }).from(instructorContributionDailyTable).where(gte(instructorContributionDailyTable.sessionDate, last30From))) {
      const t = last30ByInstructor.get(d.id) ?? { lecture: 0, total: 0 };
      t.lecture += d.lecture;
      t.total += d.lecture + d.practice + d.other;
      last30ByInstructor.set(d.id, t);
    }
  } catch (err) {
    console.warn("[contribution] last-30-day sessions not readable:", (err as Error).message);
  }

  const rows = people.map((p) => {
    const contribution = p.teachosUserId ? byInstructor.get(p.teachosUserId) : undefined;
    const range = ranged && p.teachosUserId ? rangeByInstructor.get(p.teachosUserId) : undefined;
    const last30 = p.teachosUserId ? last30ByInstructor.get(p.teachosUserId) : undefined;
    const lectureMinutes = ranged ? (range?.lectureMinutes ?? 0) : (contribution?.lectureMinutes ?? 0);
    const practiceMinutes = ranged ? (range?.practiceMinutes ?? 0) : (contribution?.practiceMinutes ?? 0);
    const otherMinutes = ranged ? (range?.otherMinutes ?? 0) : (contribution?.otherMinutes ?? 0);
    const lectureSessions = ranged ? (range?.lectureSessions ?? 0) : (contribution?.lectureSessions ?? 0);
    const practiceSessions = ranged ? (range?.practiceSessions ?? 0) : (contribution?.practiceSessions ?? 0);
    const otherSessions = ranged ? (range?.otherSessions ?? 0) : (contribution?.otherSessions ?? 0);
    const evaluation = p.teachosUserId ? evaluationByInstructor.get(p.teachosUserId) : undefined;
    const timeSpent = p.teachosUserId ? timeSpentByInstructor.get(p.teachosUserId) : undefined;
    const joining = resolveJoining(p, joiningLookups);
    const deploymentDay = contribution?.deploymentDate ?? null;
    // Experience (2026-10-15, per request): years in the organization from the date of joining above to today, or to the date of exit
    // once there is one -- the same exit date the Instructors tab shows (payroll-converted people: the manual one; everyone else:
    // Darwin's last working day). Null when there is no joining date or the dates do not make sense.
    const exitDay = p.classification === "payroll_converted" ? p.manualExitDate : p.exitLastWorkingDate;
    const experienceEnd = exitDay ?? new Date().toISOString().slice(0, 10);
    const experienceDays = joining.date ? (Date.parse(`${experienceEnd}T00:00:00Z`) - Date.parse(`${joining.date}T00:00:00Z`)) / 86400000 : null;
    const trainingDays = joining.date && deploymentDay ? Math.round((Date.parse(`${deploymentDay}T00:00:00Z`) - Date.parse(`${joining.date}T00:00:00Z`)) / 86400000) : null;
    return {
      employee_id: p.employeeId,
      full_name: p.fullName,
      department: p.department,
      capability_manager: p.teachosManager || p.manualCapabilityManager || null,
      // Demo and AI-assessment hours: total recorded audio time of the person's Completed demo / AI assessment evaluations (hours,
      // one decimal) and how many evaluations that is. Follow the date filter.
      demo_hours: Math.round(((evaluation?.demoSeconds ?? 0) / 3600) * 10) / 10,
      demo_evaluations: evaluation?.demoCount ?? 0,
      ai_assessment_hours: Math.round(((evaluation?.aiSeconds ?? 0) / 3600) * 10) / 10,
      ai_assessment_evaluations: evaluation?.aiCount ?? 0,
      // One combined average final score (0-10, one decimal) over ALL the person's Completed Demo and AI assessment evaluations that
      // have a score (every evaluation counts once, so it is not an average of two averages); null when none do.
      // Average evaluation length (2026-10-15, per request): demo hours / demo evaluations + AI assessment hours / AI evaluations, worked out
      // from the exact seconds (not the rounded hours shown). A type with no evaluations counts as 0; null when there are none of either.
      eval_avg_hours: evaluation && evaluation.demoCount + evaluation.aiCount > 0
        ? Math.round(((evaluation.demoCount > 0 ? evaluation.demoSeconds / 3600 / evaluation.demoCount : 0) + (evaluation.aiCount > 0 ? evaluation.aiSeconds / 3600 / evaluation.aiCount : 0)) * 100) / 100
        : null,
      eval_avg_score: evaluation && evaluation.demoScored + evaluation.aiScored > 0 ? Math.round(((evaluation.demoScored > 0 ? evaluation.demoScoreSum / evaluation.demoScored : 0) + (evaluation.aiScored > 0 ? evaluation.aiScoreSum / evaluation.aiScored : 0)) * 10) / 10 : null,
      // Learning hours: total time the person spent on course units (BigQuery z_niat_instructor_day_wise_unit_wise_time_spent_details,
      // seconds converted to hours, one decimal) and the number of days with activity. Follows the date filter.
      learning_hours: Math.round(((timeSpent?.seconds ?? 0) / 3600) * 10) / 10,
      learning_days: timeSpent?.days ?? 0,
      // Subject (2026-10-14, per request) -- same value the Training Stats and Instructors tabs show.
      subject_area: normalizeSubjectArea(p.deptArea || p.manualDeptArea || null),
      product: productOf(p),
      // Date of joining (Darwin, then archive, then typed in by hand for payroll-converted people) and Training Duration: whole days
      // from joining to the first session ever scheduled (deployment date). Null when either date is missing or the first session
      // is before the joining date. All-time, not affected by the date filter.
      date_of_joining: joining.date,
      date_of_joining_source: joining.source,
      training_days: trainingDays !== null && trainingDays >= 0 ? trainingDays : null,
      experience_years: experienceDays !== null && experienceDays >= 0 ? Math.round((experienceDays / 365.25) * 10) / 10 : null,
      experience_until_exit: !!exitDay,
      classification: p.classification,
      // Instructor/Mentor bifurcation (2026-09-24, per request) -- same
      // rule as bifurcationLabel() on the Instructors tab: classification
      // "mentor" is the only Mentor marker; every other value this
      // population ever has (null, "payroll_converted") is an ordinary
      // instructor. Delivery Support/Ops classifications never reach here
      // since TRAINING_STATS_EXCLUDED_CLASSIFICATIONS already filters them
      // out above, so this population is strictly Instructor or Mentor.
      role: p.classification === "mentor" ? "Mentor" : "Instructor",
      // Distinct from 0 hours: this instructor has no BigQuery contribution
      // rows at all (never synced, or their teachos_user_id hasn't matched
      // anything in that table) -- vs. genuinely having zero COMPLETED
      // sessions on file. Mirrors has_training_data above.
      has_contribution_data: !!contribution,
      // Completed sessions in the last 30 days (always, not the date filter) -- feeds Role (by sessions).
      last30_lecture_sessions: last30?.lecture ?? 0,
      last30_sessions: last30?.total ?? 0,
      // Subject from sessions (2026-10-17): completed sessions per subject in the last 30 days, from the last Contribution sync.
      session_subjects: contribution?.sessionSubjects ?? {},
      lecture_hours: Math.round((lectureMinutes / 60) * 10) / 10,
      practice_hours: Math.round((practiceMinutes / 60) * 10) / 10,
      other_hours: Math.round((otherMinutes / 60) * 10) / 10,
      total_hours: Math.round(((lectureMinutes + practiceMinutes + otherMinutes) / 60) * 10) / 10,
      // Complete total of completed sessions: Lecture + Practice + Other (2026-10-15, per request).
      sessions_completed: ranged ? lectureSessions + practiceSessions + otherSessions : (contribution?.sessionsCompleted ?? 0),
      lecture_sessions: lectureSessions,
      practice_sessions: practiceSessions,
      other_sessions: otherSessions,
      session_days: ranged ? (range?.days ?? 0) : (contribution?.sessionDays ?? 0),
      // First session ever scheduled (2026-10-13) -- all-time, not affected by the date filter.
      deployment_date: contribution?.deploymentDate ?? null,
      // Batch coverage (2026-09-28, per request) -- see instructorContribution.ts.
      all_batches: contribution?.allBatches ?? [],
      recent_batches: contribution?.recentBatches ?? [],
      // NIAT cohort year(s) (2026-09-29, per request) -- see
      // BATCH_NAME_TO_NIAT_COHORT in instructorContribution.ts.
      niat_cohorts: contribution?.niatCohorts ?? [],
    };
  });

  res.json({
    count: rows.length,
    rows,
    synced_at: contributionRows[0]?.syncedAt ?? null,
    range: ranged ? { from: fromParam, to: toParam } : null,
  });
});

// Instructor Archive (2026-10-05, made visible per request -- see
// toApiArchiveSummary's comment above for the full backstory). Scoped to
// the same Instructor Department population computeDepartmentAndExceptionRows()
// uses for the live Instructors tab (Instructors + Mentors + Ops
// team), applied here against the archive table's own mirrored
// inDarwin/inDarwinFullRoster/inTeachos/classification/deptBucket columns
// instead of the live instructorsTable's -- intentionally a SEPARATE copy
// of that filter rather than a shared helper, since the two run against
// different tables with different column types ($inferSelect differs
// between instructorsTable and instructorArchiveTable even though the
// column names line up). Admin-only, same gating as Darwin Exit Details
// and Contribution -- this surfaces exit history, not just a live roster.
export async function loadArchivePeople() { // exported for _tmp_archive_vs_overview_exits.ts (2026-10-19)
  let allRows = await db.select().from(instructorArchiveTable);
  // Self-healing baseline (2026-10-06): if no row has the inArchiveScope
  // marker yet (first load after the column was added, or a startup seed
  // that failed before the column existed), take the baseline right now
  // instead of showing an empty page until the next sync -- see
  // archiveInstructors() and seedArchiveScopeIfEmpty() in lib/scheduler.ts.
  if (!allRows.some((r) => r.inArchiveScope)) {
    await archiveInstructors();
    allRows = await db.select().from(instructorArchiveTable);
  }

  // Scope = rows flagged inArchiveScope (2026-10-06, per request: "today
  // ~695 instructors are the baseline... new joiners get added, leavers
  // stay, we're not going to get the exit data of previous instructors,
  // we'll only concentrate from today"). archiveInstructors() sets that
  // flag the first time a person passes the live department-membership
  // test and never clears it, so: today's department members are in, anyone
  // who joins later is added on first sight, someone who leaves (even once
  // gone from both Darwin and TeachOS) stays visible with an Exited status,
  // and people who had already left before the baseline were never flagged
  // and never appear. This replaces the 2026-10-05 allRows-minus-exclusions
  // scope, which wrongly pulled in 40 pre-baseline people (33 earlier exits
  // + 7 with no exit record) and inflated the total to 727. The
  // NOT_DEPARTMENT_CLASSIFICATIONS check still applies on top, so someone
  // later reclassified into a different team drops out.
  // Archive exit lookup per employee_id (see the Archive exit rule above
  // ApprovedExitFallback): the person's most recent exit record counts when
  // it is Approved or Pending With Approver; when the most recent record is
  // Revoked/Rejected/anything else, fall back to their latest Approved
  // record (a cancelled pending request never counts).
  const exitRows = await db.select().from(darwinboxExitsTable);
  type Seen = { rank: number; id: number; status: string; iso: string | null; lwd: string | null };
  const newer = (a: Seen, existing?: Seen) => !existing || a.rank > existing.rank || (a.rank === existing.rank && a.id > existing.id);
  const latestByEmployee = new Map<string, Seen>();
  const approvedByEmployee = new Map<string, Seen>();
  // Newest "Date Of Exit" on any non-Revoked / non-Rejected record of the person (2026-10-10, per request), used when the
  // record that decides their archive status has none.
  const lwdFallbackByEmployee = new Map<string, Seen>();
  for (const exit of exitRows) {
    if (!exit.employeeId) continue;
    const status = (cell(exit.rawData, "Status", "status") ?? "").trim();
    const iso = toISODate(cell(exit.rawData, "Exit Date", "exit_date"));
    const seen: Seen = { rank: iso ? parseLooseDate(iso) : -Infinity, id: exit.id, status, iso, lwd: toISODate(cell(exit.rawData, "Date Of Exit", "date_of_exit")) };
    if (newer(seen, latestByEmployee.get(exit.employeeId))) latestByEmployee.set(exit.employeeId, seen);
    if (seen.lwd && !["revoked", "rejected"].includes(status.toLowerCase()) && newer(seen, lwdFallbackByEmployee.get(exit.employeeId))) lwdFallbackByEmployee.set(exit.employeeId, seen);
    if (status.toLowerCase() === "approved" && iso && newer(seen, approvedByEmployee.get(exit.employeeId))) approvedByEmployee.set(exit.employeeId, seen);
  }
  const archiveExitByEmployee = new Map<string, ApprovedExitFallback>();
  for (const [employeeId, latest] of latestByEmployee) {
    const lower = latest.status.toLowerCase();
    if (lower === "approved" && latest.iso) {
      archiveExitByEmployee.set(employeeId, { status: "Approved", date: latest.iso, lastWorkingDate: latest.lwd ?? lwdFallbackByEmployee.get(employeeId)?.lwd ?? null });
    } else if (lower.startsWith("pending") && latest.iso) {
      archiveExitByEmployee.set(employeeId, { status: latest.status, date: latest.iso, lastWorkingDate: latest.lwd ?? lwdFallbackByEmployee.get(employeeId)?.lwd ?? null });
    } else {
      const approved = approvedByEmployee.get(employeeId);
      if (approved?.iso) archiveExitByEmployee.set(employeeId, { status: "Approved", date: approved.iso, lastWorkingDate: approved.lwd ?? lwdFallbackByEmployee.get(employeeId)?.lwd ?? null });
    }
  }

  const people = allRows
    .filter((r) => r.inArchiveScope && !NOT_DEPARTMENT_CLASSIFICATIONS.has(r.classification ?? ""))
    .map((r) => toApiArchiveSummary(r, r.employeeId ? archiveExitByEmployee.get(r.employeeId) : undefined))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  return people;
}

router.get("/reports/instructor-archive", requireAuth, requireRole("admin"), async (_req, res) => {
  const people = await loadArchivePeople();
  res.json({
    people,
    total: people.length,
    active_count: people.filter((p) => p.status === "Active").length,
    exited_count: people.filter((p) => p.status === "Exited").length,
    snp_count: people.filter((p) => p.status === "SNP").length,
  });
});

// Approved exits for the Overview's Exit data card (2026-10-10, per request: "why in the manager access no exit data is
// visible"). Manager view has no login, and the full archive route above is Admin-only, so the card got a 401 there.
// This public route returns ONLY the approved, non-payroll exits and only the few fields the card shows (no emails, no
// TeachOS ids) -- the same names, Capability Managers and exit dates Manager view already sees in the Exceptions lists.
// Exit data list + day-to-day change (2026-10-23, per request: "from now keep yesterday's list"). snapshotExitCard() stores today's list
// (IST date) in exit_card_snapshot, replacing today's earlier copy; the route compares it with the latest earlier day and says who was
// added and who dropped off, with the reason the person no longer counts. Reads/writes the snapshot defensively (before the DB push the
// list still works, just without the comparison).
const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
type ArchivePerson = Awaited<ReturnType<typeof loadArchivePeople>>[number];
const onExitCard = (p: ArchivePerson) => p.status === "Exited" && (p.exit_status ?? "").trim().toLowerCase() === "approved" && !p.is_payroll;
export async function snapshotExitCard(people?: ArchivePerson[]) {
  const all = people ?? (await loadArchivePeople());
  const card = all.filter(onExitCard);
  const today = istToday();
  await db.transaction(async (tx) => {
    await tx.delete(exitCardSnapshotTable).where(eq(exitCardSnapshotTable.snapshotDate, today));
    if (card.length) await tx.insert(exitCardSnapshotTable).values(card.map((p) => ({ snapshotDate: today, employeeId: p.employee_id, fullName: p.full_name, exitDate: p.exit_date, dateOfExit: p.date_of_exit })));
  });
  return { all, card, today };
}
router.get("/reports/approved-exits", async (_req, res) => {
  const all = await loadArchivePeople();
  const people = all.filter(onExitCard)
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      employee_id: p.employee_id,
      teachos_user_id: null,
      dept_area: p.dept_area,
      capability_manager: p.capability_manager,
      is_payroll: p.is_payroll,
      date_of_exit: p.date_of_exit,
      exit_status: p.exit_status,
      exit_date: p.exit_date,
      status: p.status,
    }));
  let change: { previous_date: string; previous_total: number; added: { full_name: string; employee_id: string | null }[]; removed: { full_name: string; employee_id: string | null; reason: string }[] } | null = null;
  try {
    const { today } = await snapshotExitCard(all);
    const [prev] = await db.select({ d: exitCardSnapshotTable.snapshotDate }).from(exitCardSnapshotTable).where(lt(exitCardSnapshotTable.snapshotDate, today)).orderBy(desc(exitCardSnapshotTable.snapshotDate)).limit(1);
    if (prev) {
      const prevRows = await db.select().from(exitCardSnapshotTable).where(eq(exitCardSnapshotTable.snapshotDate, prev.d));
      const key = (id: string | null, name: string) => id || `name:${name.toLowerCase()}`;
      const nowKeys = new Set(people.map((p) => key(p.employee_id, p.full_name)));
      const prevKeys = new Set(prevRows.map((r) => key(r.employeeId, r.fullName)));
      const byKey = new Map(all.map((p) => [key(p.employee_id, p.full_name), p]));
      // Archive rows hold the Capability Manager's Employee Status, which says WHY someone left the list.
      const archiveRows = await db.select({ employeeId: instructorArchiveTable.employeeId, exitVerification: instructorArchiveTable.exitVerification }).from(instructorArchiveTable);
      const cmMark = new Map(archiveRows.filter((a) => a.employeeId).map((a) => [a.employeeId!, a.exitVerification]));
      const reasonOf = (id: string | null, name: string) => {
        const p = byKey.get(key(id, name));
        if (!p) return "no longer in the department population";
        const mark = id ? cmMark.get(id) : null;
        if (p.is_payroll || mark === "payroll_converted") return "Capability Manager marked Payroll Converted";
        if (p.status === "SNP" || mark === "serving_notice_period") return "Capability Manager marked Serving Notice Period";
        if (p.status === "Active") return `no approved Darwin exit any more (Darwin status: ${p.exit_status ?? "none"})`;
        if ((p.exit_status ?? "").toLowerCase() !== "approved") return `Darwin exit status is now ${p.exit_status}`;
        return "changed since the last list";
      };
      change = {
        previous_date: prev.d,
        previous_total: prevRows.length,
        added: people.filter((p) => !prevKeys.has(key(p.employee_id, p.full_name))).map((p) => ({ full_name: p.full_name, employee_id: p.employee_id })),
        removed: prevRows.filter((r) => !nowKeys.has(key(r.employeeId, r.fullName))).map((r) => ({ full_name: r.fullName, employee_id: r.employeeId, reason: reasonOf(r.employeeId, r.fullName) })),
      };
    }
  } catch (err) {
    console.warn("[exit-card] snapshot unavailable (run the database push):", (err as Error).message);
  }
  res.json({ people, total: people.length, change });
});

// Instructor profile (2026-10-16, per request: "showcase all the data we know about that instructor" on the instructor's own page,
// design A). Everything the other tabs know about ONE person, all-time: the summary fields the Instructors tab shows, teaching
// (Contribution), learning time, demo / AI evaluations, Workload and its three parts (worked out exactly as the Contribution tab and
// loadWorkloadByTeachosId do, so the numbers match), and per-course training status. Public, like GET /instructors/:id and the
// Instructors tab's Workload column. Semester grouping and completion % are done on the page with the Training Stats tab's own rules.
router.get("/reports/instructor-profile/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [p] = Number.isFinite(id) ? await db.select().from(instructorsTable).where(eq(instructorsTable.id, id)) : [];
  if (!p) {
    res.status(404).json({ error: "Instructor not found" });
    return;
  }
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const summary = toApiInstructorSummary(p, new Map(), undefined);
  const joining = resolveJoining(p, await loadJoiningLookups());
  const tid = p.teachosUserId;

  const [contribution] = tid ? await db.select().from(instructorContributionTable).where(eq(instructorContributionTable.instructorUserId, tid)) : [];

  let learningSeconds = 0;
  let learningDays = 0;
  try {
    if (tid) for (const t of await db.select({ seconds: instructorTimeSpentDailyTable.seconds }).from(instructorTimeSpentDailyTable).where(eq(instructorTimeSpentDailyTable.instructorUserId, tid))) { learningSeconds += t.seconds; learningDays += 1; }
  } catch (err) {
    console.warn("[profile] learning hours not readable:", (err as Error).message);
  }

  const ev = { demoSeconds: 0, demoCount: 0, demoScoreSum: 0, demoScored: 0, aiSeconds: 0, aiCount: 0, aiScoreSum: 0, aiScored: 0 };
  try {
    if (tid) for (const e of await db.select().from(instructorEvaluationDailyTable).where(eq(instructorEvaluationDailyTable.instructorUserId, tid))) {
      if (e.evaluationType === "DEMO") { ev.demoSeconds += e.seconds; ev.demoCount += e.evaluations; ev.demoScoreSum += e.scoreSum; ev.demoScored += e.scored; }
      else { ev.aiSeconds += e.seconds; ev.aiCount += e.evaluations; ev.aiScoreSum += e.scoreSum; ev.aiScored += e.scored; }
    }
  } catch (err) {
    console.warn("[profile] evaluations not readable:", (err as Error).message);
  }

  let trainingRows: (typeof instructorTrainingStatusTable.$inferSelect)[] = [];
  try {
    if (tid) trainingRows = await db.select().from(instructorTrainingStatusTable).where(eq(instructorTrainingStatusTable.instructorUserId, tid));
  } catch (err) {
    console.warn("[profile] training status not readable:", (err as Error).message);
  }
  const trainingByKey = new Map(trainingRows.map((r) => [r.courseKey, r]));
  const hasTrainingData = trainingRows.length > 0;

  const lectureMinutes = contribution?.lectureMinutes ?? 0;
  const practiceMinutes = contribution?.practiceMinutes ?? 0;
  const otherMinutes = contribution?.otherMinutes ?? 0;
  const totalHours = round1((lectureMinutes + practiceMinutes + otherMinutes) / 60);
  const sessionDays = contribution?.sessionDays ?? 0;
  const learningHours = round1(learningSeconds / 3600);
  // Workload parts, same rounding as the Contribution tab (workloadOf in contribution.tsx).
  const hoursPerDay = contribution && sessionDays > 0 ? round1(totalHours / sessionDays) : null;
  const learningPerDay = learningDays > 0 ? round1(learningHours / learningDays) : null;
  const evalAvgHours = ev.demoCount + ev.aiCount > 0 ? round2((ev.demoCount > 0 ? ev.demoSeconds / 3600 / ev.demoCount : 0) + (ev.aiCount > 0 ? ev.aiSeconds / 3600 / ev.aiCount : 0)) : null;
  const workload = hoursPerDay === null && learningPerDay === null && evalAvgHours === null ? null : round2((hoursPerDay ?? 0) + (learningPerDay ?? 0) + (evalAvgHours ?? 0));

  // Workload over a recent window (2026-10-17, per request: "mention for how many days the workload is ... freeze it for the last 30 days
  // and give an option for the last 7 days"). Same formula and rounding as above, but from the per-day tables over the last N days
  // ending today (IST): session hours / days with a completed session, learning hours / days with learning, demo + AI average length.
  const istDayMinus = (n: number) => { const d = new Date(Date.now() + 5.5 * 3600 * 1000); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const windowWorkload = async (days: number) => {
    const from = istDayMinus(days - 1);
    let minutes = 0, sessionDaysW = 0, sessions = 0, secs = 0, lDays = 0;
    const e = { demoSeconds: 0, demoCount: 0, aiSeconds: 0, aiCount: 0 };
    try {
      if (tid) for (const d of await db.select().from(instructorContributionDailyTable).where(and(eq(instructorContributionDailyTable.instructorUserId, tid), gte(instructorContributionDailyTable.sessionDate, from)))) {
        minutes += d.lectureMinutes + d.practiceMinutes + d.otherMinutes;
        const n = d.lectureSessions + d.practiceSessions + d.otherSessions;
        sessions += n;
        if (n > 0) sessionDaysW += 1;
      }
      if (tid) for (const t of await db.select({ seconds: instructorTimeSpentDailyTable.seconds }).from(instructorTimeSpentDailyTable).where(and(eq(instructorTimeSpentDailyTable.instructorUserId, tid), gte(instructorTimeSpentDailyTable.activityDate, from)))) { secs += t.seconds; lDays += 1; }
      if (tid) for (const x of await db.select().from(instructorEvaluationDailyTable).where(and(eq(instructorEvaluationDailyTable.instructorUserId, tid), gte(instructorEvaluationDailyTable.sessionDate, from)))) {
        if (x.evaluationType === "DEMO") { e.demoSeconds += x.seconds; e.demoCount += x.evaluations; } else { e.aiSeconds += x.seconds; e.aiCount += x.evaluations; }
      }
    } catch (err) {
      console.warn(`[profile] ${days}-day workload not readable:`, (err as Error).message);
    }
    const hrs = sessionDaysW > 0 ? round1(round1(minutes / 60) / sessionDaysW) : null;
    const learn = lDays > 0 ? round1(round1(secs / 3600) / lDays) : null;
    const evalH = e.demoCount + e.aiCount > 0 ? round2((e.demoCount > 0 ? e.demoSeconds / 3600 / e.demoCount : 0) + (e.aiCount > 0 ? e.aiSeconds / 3600 / e.aiCount : 0)) : null;
    return {
      days, from,
      total: hrs === null && learn === null && evalH === null ? null : round2((hrs ?? 0) + (learn ?? 0) + (evalH ?? 0)),
      hours_per_day: hrs, learning_per_day: learn, eval_avg_hours: evalH,
      session_days: sessionDaysW, sessions, learning_days: lDays, evaluations: e.demoCount + e.aiCount,
    };
  };
  const [workload7, workload30] = [await windowWorkload(7), await windowWorkload(30)];

  const exitDay = p.classification === "payroll_converted" ? p.manualExitDate : p.exitLastWorkingDate;
  const experienceEnd = exitDay ?? new Date().toISOString().slice(0, 10);
  const experienceDays = joining.date ? (Date.parse(`${experienceEnd}T00:00:00Z`) - Date.parse(`${joining.date}T00:00:00Z`)) / 86400000 : null;
  const deploymentDay = contribution?.deploymentDate ?? null;
  const trainingDays = joining.date && deploymentDay ? Math.round((Date.parse(`${deploymentDay}T00:00:00Z`) - Date.parse(`${joining.date}T00:00:00Z`)) / 86400000) : null;

  res.json({
    id: p.id,
    subject_area: normalizeSubjectArea(p.deptArea || p.manualDeptArea || null),
    product: productOf(p),
    role: p.classification === "mentor" ? "Mentor" : "Instructor",
    is_payroll: isPayrollPerson(p), // same rule as the Instructors tab (2026-10-24)
    gender: summary.gender ?? null,
    institutes: p.institutes ?? [],
    date_of_joining: joining.date,
    date_of_joining_source: joining.source,
    date_of_exit: exitDay ?? null,
    experience_years: experienceDays !== null && experienceDays >= 0 ? round1(experienceDays / 365.25) : null,
    deployment_date: deploymentDay,
    training_days: trainingDays !== null && trainingDays >= 0 ? trainingDays : null,
    teaching: {
      has_data: !!contribution,
      lecture_hours: round1(lectureMinutes / 60),
      practice_hours: round1(practiceMinutes / 60),
      other_hours: round1(otherMinutes / 60),
      total_hours: totalHours,
      lecture_sessions: contribution?.lectureSessions ?? 0,
      practice_sessions: contribution?.practiceSessions ?? 0,
      other_sessions: contribution?.otherSessions ?? 0,
      sessions_completed: contribution?.sessionsCompleted ?? 0,
      session_days: sessionDays,
      all_batches: contribution?.allBatches ?? [],
      recent_batches: contribution?.recentBatches ?? [],
      niat_cohorts: contribution?.niatCohorts ?? [],
    },
    learning: { hours: learningHours, days: learningDays },
    evaluations: {
      demo_hours: round1(ev.demoSeconds / 3600),
      demo_count: ev.demoCount,
      demo_avg_hours: ev.demoCount > 0 ? round2(ev.demoSeconds / 3600 / ev.demoCount) : null,
      demo_avg_score: ev.demoScored > 0 ? round1(ev.demoScoreSum / ev.demoScored) : null,
      ai_hours: round1(ev.aiSeconds / 3600),
      ai_count: ev.aiCount,
      ai_avg_hours: ev.aiCount > 0 ? round2(ev.aiSeconds / 3600 / ev.aiCount) : null,
      ai_avg_score: ev.aiScored > 0 ? round1(ev.aiScoreSum / ev.aiScored) : null,
    },
    workload: { total: workload, hours_per_day: hoursPerDay, learning_per_day: learningPerDay, eval_avg_hours: evalAvgHours },
    // Last 7 / last 30 days (2026-10-17) -- the profile's Workload card shows 30 by default with a 7-day option.
    workload_windows: { "7": workload7, "30": workload30 },
    training: {
      has_data: hasTrainingData,
      taxonomy: TRAINING_COURSE_TAXONOMY,
      // Same status rules as GET /reports/training-stats.
      courses: Object.fromEntries(TRAINING_COURSE_TAXONOMY.map((def) => [def.key, !isResolvedCourse(def) ? "PENDING_MAPPING" : !hasTrainingData ? "NO_DATA" : (trainingByKey.get(def.key)?.status ?? "NOT_STARTED")])),
      course_progress: Object.fromEntries(trainingRows.filter((r) => r.unitsTotal > 0).map((r) => [r.courseKey, Math.round((r.unitsCompleted / r.unitsTotal) * 1000) / 10])),
    },
  });
});

export default router;
