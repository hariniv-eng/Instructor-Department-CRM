// Maintained overrides for the "TeachOS instructor count" standing rule.
//
// This is the durable, git-tracked source of truth the app's own
// classification logic (recomputeStatuses() in ../lib/reconcile.ts) reads
// on every reconcile. It replaces the one-off exports/*.csv files from the
// original manual analysis (exports/ is gitignored — it holds raw PII CSV
// dumps and is never a place the app itself reads from). See
// exports/TEACHOS_INSTRUCTOR_COUNT_RULES.md for the narrative rule this
// file encodes, and exports/instructor_classification_notes.csv /
// exports/payroll_converted_instructors_27.csv for the original source data
// EXCLUDED_EMPLOYEES was seeded from (2026-08-27). The payroll-converted
// override list that used to live in this file (PAYROLL_CONVERTED_EMPLOYEES)
// was retired 2026-09-03 — see the note near the bottom of this file.
//
// To add a new person: append an entry below and note the decided_date.
// This list can only grow with a real human decision behind each entry —
// nothing here should ever be inferred automatically.
//
// Matching key: teachosUserId first (exact match against TeachOS's stable
// instructor_user_id, the same UUID storeRaw.ts/reconcile.ts already treat
// as the reliable TeachOS-side identity), falling back to normalized full
// name — the same employeeId-then-name fallback pattern findMatch() already
// uses elsewhere in reconcile.ts. employeeId is kept here for humans reading
// this file and for display; don't rely on it for matching — a TeachOS-only
// row rarely has a resolved employeeId on the instructors table (that's
// exactly why these particular people needed a manual override).

export type ExcludedClassification = "excluded_other_department" | "excluded_non_department_team" | "excluded_ops_managers";

export interface ExcludedOverride {
  teachosUserId?: string;
  employeeId?: string;
  fullName: string;
  classification: ExcludedClassification;
  reason: string;
  decidedDate: string;
}

// 6 people found in TeachOS deployment data whose real designation/
// department isn't a teaching/instructor role at all (see the standing
// rule) — excluded from every instructor count, though they may still
// appear in the raw TeachOS table itself.
export const EXCLUDED_EMPLOYEES: ExcludedOverride[] = [
  { employeeId: "NW0005088", fullName: "Shaik Musharaf", classification: "excluded_other_department", reason: "Video Editor (Video House - NIAT) — support role, not a teaching/instructor designation", decidedDate: "2026-08-27" },
  { employeeId: "NW0007350", fullName: "Srinivas Vatturi", classification: "excluded_other_department", reason: "NIAT - Head of Operations (NIAT_Program Operations) — operations management, not a teaching/instructor designation", decidedDate: "2026-08-27" },
  { employeeId: "NW0001240", fullName: "Tejaswini Venkata", classification: "excluded_other_department", reason: "Head of Department - English and Communication Skills (Content – Aptitude & English) — HOD/managerial role, not a teaching/instructor designation", decidedDate: "2026-08-27" },
  { employeeId: "NW0003135", fullName: "Uday Kiran Palepu", classification: "excluded_other_department", reason: "Center Head (Student Success) — center management role, not a teaching/instructor designation", decidedDate: "2026-08-27" },
  { employeeId: "NW0001135", fullName: "Sireesha Maddikari", classification: "excluded_non_department_team", reason: "User-directed: classified as non-department team despite an Instructor designation (Learning Outcomes Academy)", decidedDate: "2026-08-27" },
  { teachosUserId: "657a9e364eaa4241a013f6483fdd2b6e", employeeId: "NW0006137", fullName: "Chandil Gauthami", classification: "excluded_other_department", reason: "Product Manager (Instructor Platform, NWD_P_IP) — a platform/engineering role, not a teaching/instructor designation, despite the department name containing \"Instructor\". Found via full-roster cross-check (2026-09-03): not in the Instructors department at all, but does exist elsewhere in Darwin.", decidedDate: "2026-09-03" },
];

// PAYROLL_CONVERTED_EMPLOYEES was retired 2026-09-03 — payroll-converted
// status is now fully computed by recomputeStatuses() (reconcile.ts) for
// the TeachOS-only pool that never matches Darwin at all: a TeachOS
// institute of "IIT Kharagpur" sets iit_kharagpur_team (its own team,
// reported together with "other department" as of 2026-09-04), and
// everyone left over is payroll_converted — including anyone with a Darwin
// exit record on file (folded into payroll_converted 2026-09-04; there's no
// separate exit_candidate classification anymore). No hand-maintained list
// is consulted for this anymore.

export interface OtherDepartmentOverride {
  teachosUserId?: string;
  employeeId?: string;
  fullName: string;
  reason: string;
  decidedDate: string;
}

// Individually reviewed: people who DO match Darwin's Instructors
// department directly (so without this override they'd show up counted as
// an instructor or a mentor), but a human has decided they belong in the
// "Other department" bucket instead — not an instructor, not a mentor, and
// not a hard exclusion either. Same spirit as EXCLUDED_EMPLOYEES above:
// only grows from a real reviewed decision per person. Matched by
// employeeId (or teachosUserId) ONLY — never by name alone, so a shared
// full name with someone else can never misfile this entry onto the wrong
// person (see the findOverride() fix in reconcile.ts, 2026-09-04).
// Currently empty — Shaik Musharaf (NW0007365), the only person ever filed
// here, was reclassified to Ops team (EXCLUDED_EMPLOYEES above) on
// 2026-09-04, the same day he was first added here. That Ops-team override
// was itself removed on 2026-09-08 (user-directed): he's counted as a
// Mentor now, matching his actual Darwin designation ("Software Engineering
// Mentor" under Instructors – Frontend Technologies) — no override needed
// for that outcome, since classifyDepartment() (departmentTaxonomy.ts)
// already routes that department+designation combination to the "mentor"
// bucket on its own once nothing overrides it first. Left in place (empty)
// for the next person who needs the "other department" treatment.
export const OTHER_DEPARTMENT_EMPLOYEES: OtherDepartmentOverride[] = [];

export interface ConfirmedInstructorOverride {
  teachosUserId?: string;
  employeeId?: string;
  fullName: string;
  reason: string;
  decidedDate: string;
}

// Individually reviewed, the mirror-image case of EXCLUDED_EMPLOYEES above:
// people whose ONLY Darwin match came through the full-roster fallback pass
// (reconcileDarwinFullRosterFallback() in ../lib/reconcile.ts sets
// inDarwinFullRoster=true for them) -- which normally means they're
// deliberately NOT auto-counted as an ordinary Instructor or Mentor (see
// isDarwinInstructor/isMentor in routes/reports.ts), since that broad
// ~3000+ person company roster is noisy and is exactly how this app first
// caught people like Chandil Gauthami above, who isn't really an instructor
// at all despite a department name containing "Instructor". This list is
// for the opposite case: a human has confirmed the person genuinely IS an
// instructor, even though their current Darwin department string (often an
// org-structure naming scheme the primary Instructors-department sync
// doesn't cover yet, e.g. a "NIAT_"-prefixed department) kept them out of
// that primary sync. Checked directly in routes/reports.ts's
// darwinInstructorsForCount, bypassing just the inDarwinFullRoster gate for
// these specific people -- every other classification check still has to
// hold (classification null, deptBucket tech/non_tech). Expected to
// self-resolve: once Darwin's own department field for this person is
// corrected at the source, they'll start matching the primary sync
// directly (inDarwinFullRoster flips back to false on the next sync) and
// this entry becomes a harmless no-op -- safe to leave in place rather than
// needing to remember to remove it later.
export const CONFIRMED_INSTRUCTOR_DESPITE_FULL_ROSTER: ConfirmedInstructorOverride[] = [
  { employeeId: "NW0005068", teachosUserId: "d6ea02b2433d498db44d2f0202f808c5", fullName: "Saumya Sunil Patil", reason: "Active TeachOS instructor (role INSTRUCTOR, category TECH); Darwin full-roster match shows a genuine Instructor designation (\"Software Development Instructor\") under a department using the newer \"NIAT_\" naming scheme the primary Instructors-department sync doesn't currently cover -- confirmed as a real instructor, 2026-10-05, per request (\"add her in the instructor department as an instructor\"; her department is expected to be corrected at the source later, at which point the primary sync will pick her up on its own and this override stops being needed).", decidedDate: "2026-10-05" },
];
