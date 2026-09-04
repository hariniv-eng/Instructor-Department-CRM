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

// 7 people found in TeachOS deployment data whose real designation/
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
  { employeeId: "NW0007365", fullName: "Shaik Musharaf", classification: "excluded_ops_managers", reason: "Darwin lists this person under Instructors — Frontend Technologies as \"Software Engineering Mentor\" (NWD_ID_FT_SEM), which would otherwise classify as a Mentor. User-directed (2026-09-04): file under Ops team for now instead — not Mentor, not Instructor. (Previously filed as Other department earlier the same day; superseded by this decision. Also previously wrongly caught by a different Shaik Musharaf's exclusion entry above — employee NW0005088, a Video Editor — purely because findOverride() fell back to a name-only match; that matching bug was fixed 2026-09-04.)", decidedDate: "2026-09-04" },
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
// 2026-09-04, the same day he was first added here. Left in place for the
// next person who needs this treatment.
export const OTHER_DEPARTMENT_EMPLOYEES: OtherDepartmentOverride[] = [];
