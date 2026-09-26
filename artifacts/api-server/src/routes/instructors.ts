import { Router, type IRouter } from "express";
import { and, arrayContains, asc, eq, ilike, or } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { VALID_CAPABILITY_MANAGERS } from "../data/validCapabilityManagers";
import { SUBJECT_AREAS } from "../lib/departmentTaxonomy";

const router: IRouter = Router();
const toApiInstructor = (row: typeof instructorsTable.$inferSelect) => ({
  id: row.id,
  employee_id: row.employeeId,
  teachos_user_id: row.teachosUserId,
  full_name: row.fullName,
  org_email: row.orgEmail,
  mobile: row.mobile,
  date_of_joining: row.dateOfJoining,
  department: row.department,
  sub_department: row.subDepartment,
  designation: row.designation,
  direct_manager: row.directManager,
  work_location: row.workLocation,
  workspace: row.workspace,
  gender: row.gender,
  manual_gender: row.manualGender,
  current_state: row.currentState,
  current_city: row.currentCity,
  darwin_employee_status: row.darwinEmployeeStatus,
  in_darwin: row.inDarwin,
  in_teachos: row.inTeachos,
  teachos_role: row.teachosRole,
  teachos_category: row.teachosCategory,
  teachos_manager: row.teachosManager,
  manual_capability_manager: row.manualCapabilityManager,
  institutes: row.institutes,
  computed_status: row.computedStatus,
  manual_status: row.manualStatus,
  exit_date: row.exitDate,
  converted_university_name: row.convertedUniversityName,
  notes: row.notes,
  // TeachOS instructor-count classification — see
  // artifacts/api-server/src/data/classificationOverrides.ts and
  // TEACHOS_INSTRUCTOR_COUNT_RULES.md.
  classification: row.classification,
  classification_reason: row.classificationReason,
  exit_flag: row.exitFlag,
  exit_flag_status: row.exitFlagStatus,
  exit_flag_date: row.exitFlagDate,
  exit_verification: row.exitVerification,
  // Department taxonomy + deployment status — see
  // artifacts/api-server/src/lib/departmentTaxonomy.ts.
  dept_bucket: row.deptBucket,
  dept_area: row.deptArea,
  manual_dept_area: row.manualDeptArea,
  deployment_status: row.deploymentStatus,
  in_darwin_full_roster: row.inDarwinFullRoster,
});

// The Instructor Details UI's three-way "Classification" filter (Instructor
// / Mentor / Excluded) is coarser than the deptBucket column itself:
// deptBucket "tech" and "non_tech" both mean "counted as an instructor",
// and "excluded_ops_managers"/"instructor_ops" both mean "excluded". This
// maps the UI-facing value onto the set of deptBucket values it covers —
// see lib/departmentTaxonomy.ts for what each deptBucket value means.
const CLASSIFICATION_GROUPS: Record<string, string[]> = {
  instructor: ["tech", "non_tech"],
  mentor: ["mentor"],
  excluded: ["excluded_ops_managers", "instructor_ops"],
};

router.get("/instructors", async (req, res) => {
  const {
    search,
    status,
    sub_department: subDepartment,
    designation,
    source,
    classification,
    exit_flag: exitFlag,
    dept_bucket: deptBucketParam,
    dept_area: deptArea,
    institute,
  } = req.query as Record<string, string | undefined>;
  const conditions = [];
  if (search) conditions.push(or(ilike(instructorsTable.fullName, `%${search}%`), ilike(instructorsTable.employeeId, `%${search}%`), ilike(instructorsTable.orgEmail, `%${search}%`)));
  if (status) conditions.push(or(eq(instructorsTable.manualStatus, status), eq(instructorsTable.computedStatus, status)));
  if (subDepartment) conditions.push(eq(instructorsTable.subDepartment, subDepartment));
  if (designation) conditions.push(eq(instructorsTable.designation, designation));
  if (source === "darwin") conditions.push(eq(instructorsTable.inDarwin, true));
  if (source === "teachos") conditions.push(eq(instructorsTable.inTeachos, true));
  if (source === "both") conditions.push(and(eq(instructorsTable.inDarwin, true), eq(instructorsTable.inTeachos, true)));
  if (classification) conditions.push(eq(instructorsTable.classification, classification));
  if (exitFlag === "true") conditions.push(eq(instructorsTable.exitFlag, true));
  if (exitFlag === "false") conditions.push(eq(instructorsTable.exitFlag, false));
  // dept_bucket accepts either a raw deptBucket value ("tech", "non_tech",
  // "mentor", "excluded_ops_managers", "instructor_ops") or one of the
  // three UI-facing group names above ("instructor" / "mentor" / "excluded").
  if (deptBucketParam) {
    const group = CLASSIFICATION_GROUPS[deptBucketParam];
    conditions.push(group ? or(...group.map((value) => eq(instructorsTable.deptBucket, value))) : eq(instructorsTable.deptBucket, deptBucketParam));
  }
  if (deptArea) conditions.push(eq(instructorsTable.deptArea, deptArea));
  if (institute) conditions.push(arrayContains(instructorsTable.institutes, [institute]));
  const rows = await db.select().from(instructorsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(instructorsTable.fullName));
  res.json(rows.map(toApiInstructor));
});

router.get("/instructors/:id", async (req, res): Promise<void> => {
  const [row] = await db.select().from(instructorsTable).where(eq(instructorsTable.id, Number(req.params.id)));
  if (!row) {
    res.status(404).json({ error: "Instructor not found" });
    return;
  }
  res.json(toApiInstructor(row));
});

// Reads (list/detail) are public — this is what the no-login "Manager view"
// reads for the Overview + Instructors tabs (see routes/index.ts). Writes
// stay Admin-only: with no login on the read side there's no identity to
// hold accountable for a create/edit, so those two routes self-protect here
// rather than relying on router-level mounting.
router.post("/instructors", requireAuth, requireRole("admin"), async (req, res) => {
  const body = req.body as Record<string, string | null | undefined>;
  const [row] = await db.insert(instructorsTable).values({
    fullName: body.fullName ?? body.full_name ?? "Unnamed instructor",
    employeeId: body.employeeId ?? body.employee_id,
    orgEmail: body.orgEmail ?? body.org_email,
    subDepartment: body.subDepartment ?? body.sub_department,
    designation: body.designation,
    inDarwin: true,
    darwinEmployeeStatus: "Active",
    computedStatus: "active",
  }).returning();
  res.status(201).json(toApiInstructor(row));
});

router.patch("/instructors/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const body = req.body as Record<string, string | null | undefined>;
  const [row] = await db.update(instructorsTable).set({
    manualStatus: body.manual_status,
    exitDate: body.exit_date,
    convertedUniversityName: body.converted_university_name,
    notes: body.notes,
  }).where(eq(instructorsTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Instructor not found" });
    return;
  }
  res.json(toApiInstructor(row));
});

// Manual Gender is its own narrower endpoint, separate from the general
// PATCH /instructors/:id above -- that one edits Manual Status, Exit Date,
// etc. and is deliberately Admin-only. Gender was asked to be editable by
// EITHER role (Admin or Manager) (2026-09-09, per request) -- a dedicated
// route keeps that wider access scoped to just this one low-stakes field
// instead of loosening the other, more sensitive manual fields to Manager
// too. Public, no requireAuth (2026-09-26, per request: "make sure the
// manual entry is also accessed by the manager access") -- this used to sit
// behind requireAuth alone, which worked as "either role" back when Manager
// had its own login, but since that Manager login was removed (2026-09,
// "no Manager login anymore" -- see App.tsx's Guard comment), Manager view
// never carries a session at all, so requireAuth had silently become
// Admin-only in practice, exactly contradicting this comment's own stated
// intent. Dropped entirely so Manager view (unauthenticated, per its
// design) can actually reach this, matching how the base GET routes in this
// same router are already public for the same reason (see routes/index.ts).
router.patch("/instructors/:id/gender", async (req, res): Promise<void> => {
  const raw = (req.body as { manual_gender?: string | null }).manual_gender;
  if (raw !== "male" && raw !== "female" && raw !== null) {
    res.status(400).json({ error: 'manual_gender must be "male", "female", or null' });
    return;
  }
  const [row] = await db.update(instructorsTable).set({ manualGender: raw }).where(eq(instructorsTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Instructor not found" });
    return;
  }
  res.json(toApiInstructor(row));
});

// Manual Capability Manager (2026-09-15, per request): for people TeachOS's
// own Capability Manager candidates don't resolve to anyone on the
// maintained VALID_CAPABILITY_MANAGERS roster (see
// reconcileCapabilityManager() in lib/reconcile.ts and that roster file's
// own comment for why so many candidate rows get discarded), a human who
// knows the person can mark their real Capability Manager here instead --
// constrained to that same roster, not free text, so this can't drift into
// a name that isn't actually a Capability Manager. Unlike Gender, this
// stays Admin-only (requireRole("admin")), matching the general manual-edit
// PATCH above -- there was no explicit ask to widen this one to Manager
// the way Gender was.
router.patch("/instructors/:id/capability-manager", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const raw = (req.body as { manual_capability_manager?: string | null }).manual_capability_manager;
  if (raw !== null && !VALID_CAPABILITY_MANAGERS.includes(raw as string)) {
    res.status(400).json({ error: "manual_capability_manager must be one of the maintained Capability Manager names, or null" });
    return;
  }
  const [row] = await db.update(instructorsTable).set({ manualCapabilityManager: raw }).where(eq(instructorsTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Instructor not found" });
    return;
  }
  res.json(toApiInstructor(row));
});

// Manual Subject (2026-09-15, per request): for people classifyDepartment()
// left unclassified -- no usable Darwin department string, or a
// TeachOS-only row with no Darwin match at all -- a human who knows the
// person's real teaching area can mark it here instead, constrained to
// departmentTaxonomy.ts's own SUBJECT_AREAS rather than free text, so this
// can't drift into an area name the taxonomy doesn't recognize. Was
// Admin-only; opened up to Manager too (2026-09-26, per request), same
// reasoning as Gender above -- dropped requireAuth/requireRole entirely
// since Manager view carries no session to check in the first place.
router.patch("/instructors/:id/subject", async (req, res): Promise<void> => {
  const raw = (req.body as { manual_dept_area?: string | null }).manual_dept_area;
  if (raw !== null && !SUBJECT_AREAS.includes(raw as string)) {
    res.status(400).json({ error: "manual_dept_area must be one of departmentTaxonomy.ts's recognized area names, or null" });
    return;
  }
  const [row] = await db.update(instructorsTable).set({ manualDeptArea: raw }).where(eq(instructorsTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Instructor not found" });
    return;
  }
  res.json(toApiInstructor(row));
});

const EXIT_VERIFICATION_VALUES = ["exited", "serving_notice_period", "payroll_converted", "absconded"] as const;

// Exit verification (2026-09-17, per request; Absconded/Revoked added
// 2026-09-19; Revoked removed again as a settable value 2026-09-19 --
// see below): lets a Capability Manager record their read on an
// exit-flagged record -- exited / serving notice period / payroll converted
// / absconded -- directly from the Exit column on the Instructors tab
// table. Reachable by either Admin or Manager, same population as Gender
// above -- there was an explicit ask for Capability Managers themselves to
// be able to set this. Public, no requireAuth (2026-09-26, per request --
// see Gender's comment above for the full reasoning: Manager view carries
// no session at all since its own login was removed, so requireAuth here
// had quietly become Admin-only, blocking exactly the access this comment
// already said it should have). Deliberately does NOT touch
// manualStatus/computedStatus: this is a tracking label only, same
// "flag, don't subtract" philosophy as exitFlag itself (see
// recomputeStatuses() and its comment in the schema) -- actually excluding
// someone from the headcount stays the separate Manual Status control on
// the instructor detail page (Admin-only). Only meaningful for exit-flagged
// rows, but not enforced server-side -- the frontend only shows the
// dropdown when exit_flag is true; setting this for a non-flagged row is
// harmless (it just won't be visible anywhere) rather than blocked outright.
// "revoked" was dropped from this list (per request, 2026-09-19) now that
// reports.ts's exceptionRows already auto-excludes anyone Darwinbox's own
// live exit sync reports as "Revoked" (see hasRevokedExitStatus/
// exitFlagStatus there) -- a manual "Revoked" label was redundant with that
// automatic check. Any instructor row still carrying a historic manual
// exit_verification of "revoked" from before this change keeps being
// excluded from the Exception queue (reports.ts still checks for it), it
// just can no longer be newly set through this dropdown/endpoint.
router.patch("/instructors/:id/exit-verification", async (req, res): Promise<void> => {
  const raw = (req.body as { exit_verification?: string | null }).exit_verification;
  if (raw !== null && !EXIT_VERIFICATION_VALUES.includes(raw as (typeof EXIT_VERIFICATION_VALUES)[number])) {
    res.status(400).json({ error: 'exit_verification must be "exited", "serving_notice_period", "payroll_converted", "absconded", or null' });
    return;
  }
  const [row] = await db.update(instructorsTable).set({ exitVerification: raw }).where(eq(instructorsTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Instructor not found" });
    return;
  }
  res.json(toApiInstructor(row));
});

export default router;
