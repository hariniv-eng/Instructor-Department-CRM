// Permanent instructor archive (2026-09-28, per request: "every time an
// instructor is converted to payroll, his darwin box is getting deleted...
// the only information we're going to have about that payroll instructor is
// in the teachos data... create a whole table where we store all the
// instructor data, even if they're exited"). See instructorArchiveTable's
// own comment in lib/db/src/schema/index.ts for the storage side of this.
//
// Called once at the end of every recomputeStatuses() run (lib/reconcile.ts)
// -- so it runs on the exact same cadence as every Darwin/TeachOS sync,
// manual "Sync Now" clicks and the scheduled background sync alike, per
// request ("all this data will be updated every day").
//
// Every instructorsTable data column is mirrored here, split into two
// treatments:
//   - LIVE-STATUS fields (inDarwin, inTeachos, computedStatus,
//     classification, classificationReason, exitFlag, exitFlagStatus,
//     exitFlagDate, inDarwinFullRoster, deploymentStatus,
//     payrollCandidateMatched, fullName) are copied verbatim every time,
//     even when that means overwriting with null/false -- these are
//     recomputed fresh on every reconcile and a null/false value is a real
//     state (e.g. "no override applies right now"), not data loss.
//   - Everything else (raw Darwin/TeachOS fields, manual-entry fields,
//     exit-derived gap-fill fields, Subject/area classification) is only
//     ever overwritten when the live row actually has a populated value --
//     see keep()/isAbsent() below. A field that's gone null or empty on the
//     live side (most commonly: every Darwin-sourced field, once someone's
//     Darwin record disappears on payroll conversion) simply keeps
//     whatever was archived from the last time it WAS populated.
// No code path here (or anywhere else in the app) ever deletes a row from
// this table -- its row count can only grow.
import { eq } from "drizzle-orm";
import { instructorArchiveTable, instructorsTable } from "@workspace/db";
import { sdb as db } from "./syncContext";
import { normalize } from "./reconcile";
import { isPinnedConfirmedInstructor } from "../data/classificationOverrides";

type LiveRow = typeof instructorsTable.$inferSelect;
type ArchiveRow = typeof instructorArchiveTable.$inferSelect;

// "Absent" for coalescing purposes: SQL null, OR an empty array --
// `institutes` defaults to [] rather than null, so a genuinely empty
// deployment list must count as "nothing new to record" too, otherwise
// someone who's lost their TeachOS deployment would have their Campus
// history erased here the same way it's blanked on the live row.
function isAbsent(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// Picks the live value when it's actually populated, otherwise keeps
// whatever's already archived.
function keep<T>(liveValue: T, archivedValue: T): T {
  return isAbsent(liveValue) ? archivedValue : liveValue;
}

// Archive scope (2026-10-06, per request: today's department is the
// baseline, new joiners get added, leavers stay, and anyone who left before
// the baseline is never brought in). A person is "in scope" the first time
// this returns true for their LIVE row, and archiveInstructors() below then
// sets instructorArchiveTable.inArchiveScope permanently. This is the same
// five-way department-membership test the live Instructors tab's
// departmentRows uses (computeDepartmentAndExceptionRows in
// routes/reports.ts): Darwin instructors, TeachOS-only payroll-converted,
// TeachOS-only needs-review, mentors, ops team. Kept as a separate copy
// here because lib/ can't import from routes/ (reconcile.ts -> this file ->
// routes/reports.ts -> reconcile.ts would be a cycle) -- if that test ever
// changes there, change it here too.
const isConfirmedDespiteFullRoster = (row: LiveRow): boolean => isPinnedConfirmedInstructor(row);

// Exit date of a live row whose Darwinbox exit record is Approved, else null.
function approvedExitDate(row: LiveRow): string | null {
  return (row.exitFlagStatus ?? "").trim().toLowerCase() === "approved" ? row.exitFlagDate ?? null : null;
}

function isDepartmentMember(liveRow: LiveRow): boolean {
  // Pinned edge case (NW0005068): treated as an ordinary tech instructor on
  // every sync, even if today's Darwin/TeachOS match dropped her.
  const row: LiveRow = isConfirmedDespiteFullRoster(liveRow)
    ? { ...liveRow, inDarwin: true, inDarwinFullRoster: true, classification: null, deptBucket: liveRow.deptBucket === "non_tech" ? "non_tech" : "tech" }
    : liveRow;
  const darwinInstructor = row.inDarwin && (!row.inDarwinFullRoster || isConfirmedDespiteFullRoster(row)) && !row.classification && (row.deptBucket === "tech" || row.deptBucket === "non_tech");
  const teachosOnly = row.inTeachos && !row.inDarwin;
  const payrollConverted = teachosOnly && row.classification === "payroll_converted";
  const needsReview = teachosOnly
    && row.classification !== "excluded_other_department"
    && row.classification !== "excluded_non_department_team"
    && row.classification !== "iit_kharagpur_team"
    && row.classification !== "payroll_converted";
  const mentor = row.inDarwin && !row.inDarwinFullRoster && row.classification === "mentor";
  const opsTeam = row.classification === "excluded_ops_managers";
  return darwinInstructor || payrollConverted || needsReview || mentor || opsTeam;
}

function findArchiveMatch(archived: ArchiveRow[], row: LiveRow): { match: ArchiveRow | undefined; matchedBy: string | null } {
  if (row.employeeId) {
    const match = archived.find((item) => item.employeeId === row.employeeId);
    if (match) return { match, matchedBy: "employee_id" };
  }
  if (row.teachosUserId) {
    const match = archived.find((item) => item.teachosUserId === row.teachosUserId);
    if (match) return { match, matchedBy: "teachos_user_id" };
  }
  const normalized = normalize(row.fullName);
  const match = archived.find((item) => normalize(item.fullName) === normalized);
  return { match, matchedBy: match ? "name" : null };
}

export async function archiveInstructors(): Promise<{ created: number; updated: number }> {
  const liveRows = await db.select().from(instructorsTable);
  const archivedRows = await db.select().from(instructorArchiveTable);
  let created = 0;
  let updated = 0;

  for (const row of liveRows) {
    const { match, matchedBy } = findArchiveMatch(archivedRows, row);

    const inScopeNow = isDepartmentMember(row);

    if (!match) {
      const [inserted] = await db.insert(instructorArchiveTable).values({
        inArchiveScope: inScopeNow,
        employeeId: row.employeeId,
        teachosUserId: row.teachosUserId,
        fullName: row.fullName,
        orgEmail: row.orgEmail,
        mobile: row.mobile,
        dateOfJoining: row.dateOfJoining,
        department: row.department,
        subDepartment: row.subDepartment,
        designation: row.designation,
        directManager: row.directManager,
        workLocation: row.workLocation,
        workspace: row.workspace,
        gender: row.gender,
        manualGender: row.manualGender,
        currentState: row.currentState,
        currentCity: row.currentCity,
        darwinEmployeeStatus: row.darwinEmployeeStatus,
        inDarwin: row.inDarwin,
        inTeachos: row.inTeachos,
        teachosRole: row.teachosRole,
        teachosCategory: row.teachosCategory,
        teachosManager: row.teachosManager,
        enrolledPlans: row.enrolledPlans,
        manualCapabilityManager: row.manualCapabilityManager,
        institutes: row.institutes,
        computedStatus: row.computedStatus,
        manualStatus: row.manualStatus,
        exitDate: row.exitDate ?? approvedExitDate(row),
        convertedUniversityName: row.convertedUniversityName,
        notes: row.notes,
        classification: row.classification,
        classificationReason: row.classificationReason,
        exitFlag: row.exitFlag,
        exitFlagStatus: row.exitFlagStatus,
        exitFlagDate: row.exitFlagDate,
        exitVerification: row.exitVerification,
        inDarwinFullRoster: row.inDarwinFullRoster,
        deptBucket: row.deptBucket,
        deptArea: row.deptArea,
        manualDeptArea: row.manualDeptArea,
        exitDepartment: row.exitDepartment,
        exitDesignation: row.exitDesignation,
        exitGender: row.exitGender,
        deploymentStatus: row.deploymentStatus,
        payrollCandidateMatched: row.payrollCandidateMatched,
        payrollCandidateNote: row.payrollCandidateNote,
      }).returning();
      archivedRows.push(inserted);
      created += 1;
      continue;
    }

    await db.update(instructorArchiveTable).set({
      // -- sticky: kept unless the live row has a real value --
      employeeId: keep(row.employeeId, match.employeeId),
      teachosUserId: keep(row.teachosUserId, match.teachosUserId),
      orgEmail: keep(row.orgEmail, match.orgEmail),
      mobile: keep(row.mobile, match.mobile),
      dateOfJoining: keep(row.dateOfJoining, match.dateOfJoining),
      department: keep(row.department, match.department),
      subDepartment: keep(row.subDepartment, match.subDepartment),
      designation: keep(row.designation, match.designation),
      directManager: keep(row.directManager, match.directManager),
      workLocation: keep(row.workLocation, match.workLocation),
      workspace: keep(row.workspace, match.workspace),
      gender: keep(row.gender, match.gender),
      manualGender: keep(row.manualGender, match.manualGender),
      currentState: keep(row.currentState, match.currentState),
      currentCity: keep(row.currentCity, match.currentCity),
      darwinEmployeeStatus: keep(row.darwinEmployeeStatus, match.darwinEmployeeStatus),
      teachosRole: keep(row.teachosRole, match.teachosRole),
      teachosCategory: keep(row.teachosCategory, match.teachosCategory),
      teachosManager: keep(row.teachosManager, match.teachosManager),
      enrolledPlans: keep(row.enrolledPlans, match.enrolledPlans),
      manualCapabilityManager: keep(row.manualCapabilityManager, match.manualCapabilityManager),
      institutes: keep(row.institutes, match.institutes),
      manualStatus: keep(row.manualStatus, match.manualStatus),
      // Remember Approved exits (2026-10-06, per request: "whoever exit data
      // is approved, get their data"): Darwinbox's exits report is replaced
      // wholesale on every sync, so a record it later drops would otherwise
      // turn an exited person back to Active. The first time a live row
      // carries an Approved exit, stamp its date into this sticky field.
      exitDate: keep(row.exitDate, match.exitDate) ?? approvedExitDate(row),
      convertedUniversityName: keep(row.convertedUniversityName, match.convertedUniversityName),
      notes: keep(row.notes, match.notes),
      exitVerification: keep(row.exitVerification, match.exitVerification),
      deptBucket: keep(row.deptBucket, match.deptBucket),
      deptArea: keep(row.deptArea, match.deptArea),
      manualDeptArea: keep(row.manualDeptArea, match.manualDeptArea),
      exitDepartment: keep(row.exitDepartment, match.exitDepartment),
      exitDesignation: keep(row.exitDesignation, match.exitDesignation),
      exitGender: keep(row.exitGender, match.exitGender),
      payrollCandidateNote: keep(row.payrollCandidateNote, match.payrollCandidateNote),
      // -- live-status: always overwritten verbatim, null/false included --
      fullName: row.fullName,
      inDarwin: row.inDarwin,
      inTeachos: row.inTeachos,
      computedStatus: row.computedStatus,
      classification: row.classification,
      classificationReason: row.classificationReason,
      exitFlag: row.exitFlag,
      exitFlagStatus: row.exitFlagStatus,
      exitFlagDate: row.exitFlagDate,
      inDarwinFullRoster: row.inDarwinFullRoster,
      deploymentStatus: row.deploymentStatus,
      payrollCandidateMatched: row.payrollCandidateMatched,
      // -- archive bookkeeping --
      // Sticky: once true, never flipped back (a person who leaves the
      // department stays in the archive, per the "nobody is ever removed"
      // rule).
      inArchiveScope: match.inArchiveScope || inScopeNow,
      archiveMatchedBy: matchedBy,
      lastSyncedAt: new Date(),
    }).where(eq(instructorArchiveTable.id, match.id));
    updated += 1;
  }

  return { created, updated };
}
