// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

import { createInsertSchema } from "drizzle-zod";
import { boolean, date, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const instructorsTable = pgTable("instructors", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").unique(),
  teachosUserId: text("teachos_user_id").unique(),
  fullName: text("full_name").notNull(),
  orgEmail: text("org_email"),
  mobile: text("mobile"),
  dateOfJoining: date("date_of_joining"),
  department: text("department"),
  subDepartment: text("sub_department"),
  designation: text("designation"),
  directManager: text("direct_manager"),
  workLocation: text("work_location"),
  workspace: text("workspace"),
  gender: text("gender"),
  // Manual fallback for `gender` above (2026-09-09, per request) -- for
  // someone with no current Darwin record (or a Darwin record that just
  // doesn't have gender filled in), Darwin can never supply this, so a
  // human who knows the person can mark it here instead. Never written by
  // any sync path (reconcileDarwin/reconcileDarwinFullRosterFallback/
  // recomputeStatuses) -- like manualStatus/notes below, it only changes via
  // the dedicated PATCH .../gender endpoint, so it survives every sync.
  // Effective gender shown anywhere in the app = Darwin's value when
  // present, else this. See reports.ts's toApiInstructorSummary.
  manualGender: text("manual_gender"),
  currentState: text("current_state"),
  currentCity: text("current_city"),
  darwinEmployeeStatus: text("darwin_employee_status"),
  inDarwin: boolean("in_darwin").notNull().default(false),
  inTeachos: boolean("in_teachos").notNull().default(false),
  teachosRole: text("teachos_role"),
  teachosCategory: text("teachos_category"),
  teachosManager: text("teachos_manager"),
  // Manual fallback for `teachosManager` above (2026-09-15, per request) --
  // same pattern as manualGender above: for someone TeachOS's own
  // Capability Manager candidates don't resolve to any name on the
  // maintained VALID_CAPABILITY_MANAGERS roster (see
  // ../../../artifacts/api-server/src/data/validCapabilityManagers.ts),
  // a human can mark their real Capability Manager here instead, chosen
  // from that same roster (not free text -- see the dedicated PATCH
  // .../capability-manager endpoint, which validates against it). Never
  // written by any sync path -- it only changes via that endpoint, so it
  // survives every sync. Effective value shown anywhere in the app =
  // TeachOS's value when present, else this. See reports.ts's
  // toApiInstructorSummary.
  manualCapabilityManager: text("manual_capability_manager"),
  institutes: text("institutes").array().notNull().default([]),
  // active | pending_deployment | needs_review | excluded — see
  // recomputeStatuses() in lib/reconcile.ts. "excluded" means this row
  // matched an entry in classificationOverrides.ts's EXCLUDED_EMPLOYEES list
  // (an "Instructor"-looking record that a human has decided isn't actually
  // an instructor for headcount purposes, e.g. Other Department / Non-
  // Department Team) and should be left out of instructor counts by default.
  computedStatus: text("computed_status").notNull().default("needs_review"),
  manualStatus: text("manual_status"),
  exitDate: date("exit_date"),
  convertedUniversityName: text("converted_university_name"),
  notes: text("notes"),
  // --- TeachOS instructor-count classification (standing rule; see
  // artifacts/api-server/src/data/classificationOverrides.ts and
  // TEACHOS_INSTRUCTOR_COUNT_RULES.md) ---
  // Set by recomputeStatuses() matching this row against the maintained
  // override lists in classificationOverrides.ts. One of:
  // "excluded_other_department" | "excluded_non_department_team" |
  // "payroll_converted" | "confirmed_instructor" | null (no override — normal).
  classification: text("classification"),
  // Human-readable reason copied from the matched override list entry.
  classificationReason: text("classification_reason"),
  // Whether this person has a Darwinbox resignation/exit record on file.
  // This is a FLAG, not a status — an exit-flagged instructor still counts
  // in the standing instructor total, per the standing rule; use this to
  // report an "active, no exit record" subtotal separately. Computed live
  // from darwinboxExitsTable on every reconcile — not a maintained override.
  exitFlag: boolean("exit_flag").notNull().default(false),
  // The Darwinbox resignation record's status as of the most recent exit
  // sync, e.g. "Approved", "Pending With Approver", "Rejected", "Revoked".
  exitFlagStatus: text("exit_flag_status"),
  exitFlagDate: date("exit_flag_date"),
  // Manual exit-review label (2026-09-17, per request). One of "exited" |
  // "serving_notice_period" | "payroll_converted" | "absconded" | "revoked"
  // (the last two added 2026-09-19, per request), or null (not yet
  // reviewed). A brief 2026-09-18 change made "exited" auto-remove the
  // person from their category's headcount; that was REVERTED the next day
  // (2026-09-19, per explicit request) because removing someone from the
  // active list needs to stay a deliberate action, not a side effect of
  // picking a dropdown value -- so this is back to being a TRACKING LABEL
  // ONLY again, for every value including "exited"/"absconded": it does not
  // touch computedStatus/manualStatus, and does not change
  // total_instructor_count/mentors_count/ops_team_count/
  // department_total_count in reports.ts. Actually removing someone from the
  // active list/headcount stays a separate, deliberate action (the Manual
  // Status control on the instructor detail page) -- this field's job is
  // just to drive the Instructors tab's Exception queue (see
  // GET /reports/instructors's exceptionRows in reports.ts): anyone
  // exit-flagged and not yet "payroll_converted" or "revoked" (i.e. null,
  // "serving_notice_period", "exited", or "absconded") shows there as
  // something needing a look -- "serving_notice_period" surfaces there
  // purely for visibility, while "exited"/"absconded" are the actual action
  // items (waiting on that separate Manual Status removal). "payroll_converted"
  // and "revoked" mean the situation is resolved -- Darwinbox's own record
  // shows the exit was either converted to payroll or the resignation
  // request was cancelled -- so those drop off the queue. Reachable by
  // either Admin or Manager, same population as manualGender -- see the
  // dedicated PATCH .../exit-verification route. Never written by any sync
  // path, so it survives every sync; the frontend only shows the dropdown
  // for rows where exitFlag is true (see toApiInstructorSummary in
  // reports.ts) -- not enforced server-side.
  exitVerification: text("exit_verification"),
  // True when this person was NOT found in the Instructors-department-
  // filtered Darwin data (darwinbox_active) but WAS found via the fallback
  // match against Darwin's full/unfiltered company roster
  // (darwinbox_full_roster) — see reconcileDarwinFullRosterFallback() in
  // lib/reconcile.ts. When this is true, `inDarwin`, `employeeId`,
  // `department`, `darwinEmployeeStatus` etc. were backfilled from that
  // full-roster match rather than from the primary Darwin sync. Purely an
  // audit/reporting flag — recomputeStatuses() treats a full-roster match
  // exactly the same as a primary-dept match once inDarwin is true.
  inDarwinFullRoster: boolean("in_darwin_full_roster").notNull().default(false),
  // --- Department taxonomy + deployment status (see
  // artifacts/api-server/src/lib/departmentTaxonomy.ts) ---
  // "tech" | "non_tech" | null (unclassified — blank/garbage department
  // value, or no department data resolved at all yet).
  deptBucket: text("dept_bucket"),
  // Within deptBucket: e.g. "Frontend", "Backend", "DSA", "GenAI",
  // "Artificial Intelligence & Emerging Technologies", "Interdisciplinary &
  // Applied Sciences", "English", "Aptitude", "Math". null when deptBucket
  // is null, or when only the coarse TeachOS category (not the finer Darwin
  // department string) was available to classify from. One exception
  // (2026-09-21, per request to surface Subject for mentors too): a Mentor
  // embedded within an Instructors sub-department can have a real value
  // here even though deptBucket itself is still forced null for that row
  // (reconcile.ts's isDeptExclusion vs. the narrower isAreaExclusion) --
  // deptBucket only ever means tech/non_tech, so "mentor" was never a value
  // it could hold, but the sub-area classifyDepartment() resolved for that
  // person is still real and worth keeping.
  deptArea: text("dept_area"),
  // Manual fallback for `deptArea` above (2026-09-15, per request) -- same
  // pattern as manualGender/manualCapabilityManager: for someone
  // classifyDepartment() left unclassified (no usable Darwin department
  // string, or a TeachOS-only row with no Darwin match at all -- see
  // departmentTaxonomy.ts), a human who knows the person's real teaching
  // area can mark it here instead, chosen from that same taxonomy's area
  // names (not free text -- see the dedicated PATCH .../subject endpoint,
  // which validates against it). Deliberately NOT offered for Operations
  // team rows -- their deptArea is intentionally null (excluded from the
  // tech/non_tech taxonomy entirely, not a data gap), so the frontend never
  // renders this editor there. Never written by any sync path -- it only
  // changes via that endpoint, so it survives every sync. Effective value
  // shown anywhere in the app = the computed value when present, else this.
  // See reports.ts's toApiInstructorSummary.
  manualDeptArea: text("manual_dept_area"),
  // --- Exit-derived gap-fill for payroll-converted instructors (2026-09-21,
  // per request: "payroll converted instructor dont have data like gender
  // subject and the department and also role ... get that data from the
  // exit, map the payroll instructors with there employee_id with the whole
  // exit data") ---
  // A payroll-converted person (classification "payroll_converted" —
  // isTeachosOnlyLeftover in recomputeStatuses: found in TeachOS, never
  // matched Darwin at all, neither the primary Instructors-department pass
  // nor the full-roster fallback) has no Darwin record, so `department`,
  // `designation`, and `gender` above (all Darwin-sourced) are never
  // populated for them, and deptArea/deptBucket have nothing to classify
  // from either — every one of those columns reads blank. But many of these
  // same people DO have a Darwinbox exit/resignation record on file
  // (darwinboxExitsTable, matched by employeeId — same findExit() lookup
  // recomputeStatuses() already uses for exitFlag/exitFlagStatus above), and
  // that exit record carries its own Department/Designation/Gender fields
  // straight from Darwinbox. These three columns hold exactly that —
  // written ONLY for the isTeachosOnlyLeftover population, so a normal
  // Darwin-matched instructor's row (who may separately have an exit record
  // on file too, per the "flag, don't subtract" rule) never has this
  // secondary source silently override their real Darwin data. Never
  // written by any manual-edit path — purely computed by recomputeStatuses()
  // every reconcile, same as exitFlag/exitFlagStatus/exitFlagDate.
  //
  // Effective value shown anywhere in the app, in priority order: Darwin's
  // own value (when present) > this exit-derived value > the human-entered
  // manual* fallback above (gap-filler of last resort) — same "computed
  // always wins over manual" convention every other gap-filled field in
  // this table follows. See reports.ts's toApiInstructorSummary (department/
  // designation/gender fields) and recomputeStatuses()'s deptArea line
  // (exitDesignation + exitDepartment feed classifyDepartment() the same way
  // a normal Darwin department string would, so Subject gets filled in too —
  // no separate exit_dept_area column needed, it lands in the same deptArea
  // column mentors' computed subject already uses).
  exitDepartment: text("exit_department"),
  exitDesignation: text("exit_designation"),
  exitGender: text("exit_gender"),
  // "deployed" | "in_training" | null — derived from `institutes`: any
  // institute other than the "Training Institute" placeholder counts as a
  // real campus deployment.
  deploymentStatus: text("deployment_status"),
  // --- TeachOS employee-ID mapping pipeline (see reconcileTeachosEmployeeIdReference()
  // and reconcilePayrollCandidates() in lib/reconcile.ts) ---
  // True when this person's name was found in the most recently uploaded
  // "Payroll Candidates" reference file. Combined with the static
  // PAYROLL_CONVERTED_EMPLOYEES override list in classificationOverrides.ts
  // by recomputeStatuses() when deciding classification = "payroll_converted"
  // — either source is sufficient. Reset to false for everyone at the start
  // of every "Payroll Candidates" upload (raw snapshot, fully replaced).
  payrollCandidateMatched: boolean("payroll_candidate_matched").notNull().default(false),
  // Set instead of silently overwriting when a "Payroll Candidates" upload
  // finds a name match whose employee_id conflicts with the employeeId
  // already on file (e.g. from the TeachOS ID reference or Darwin) — mirrors
  // the same conflict-flagging principle classificationOverrides.ts uses,
  // just for upload-derived matches instead of hand-maintained ones. null
  // when there's no conflict to review.
  payrollCandidateNote: text("payroll_candidate_note"),
});

export const uploadsTable = pgTable("uploads", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

// Raw per-source snapshots from the live syncs (Darwinbox Master API,
// Darwinbox Reports Builder exits API, TeachOS/BigQuery). Each live sync
// fully replaces its own table's rows with whatever it just fetched — a
// "latest known state per source" snapshot, kept deliberately separate and
// unmatched. rawData holds the entire fetched row as-is (every column the
// source returned, not just the couple pulled out below for convenience).
// Matching/merging these into `instructorsTable` (and the classification
// pass on top of that) happens in lib/reconcile.ts, invoked right after each
// live sync in routes/sync.ts as well as after a manual upload.
export const darwinboxActiveTable = pgTable("darwinbox_active", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id"),
  fullName: text("full_name"),
  rawData: jsonb("raw_data").notNull().$type<Record<string, unknown>>(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

// Darwin's FULL/unfiltered company roster (every department, every
// employee — not just the "Instructors" department subset in
// darwinbox_active above). Fetched via the same Darwinbox Master API call
// as darwinbox_active (see fetchDarwinRowsBoth() in
// lib/connectors/darwinbox.ts — one API round trip populates both tables),
// but kept as its own standing table so it can be used as a fallback match
// target: TeachOS instructors who never showed up in the Instructors-
// department export (e.g. their Darwin record is filed under Mentors, or
// under some other department entirely) can still be found here. See
// reconcileDarwinFullRosterFallback() in lib/reconcile.ts.
export const darwinboxFullRosterTable = pgTable("darwinbox_full_roster", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id"),
  fullName: text("full_name"),
  rawData: jsonb("raw_data").notNull().$type<Record<string, unknown>>(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const darwinboxExitsTable = pgTable("darwinbox_exits", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id"),
  fullName: text("full_name"),
  rawData: jsonb("raw_data").notNull().$type<Record<string, unknown>>(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teachosDeploymentTable = pgTable("teachos_deployment", {
  id: serial("id").primaryKey(),
  instructorUserId: text("instructor_user_id"),
  instructorName: text("instructor_name"),
  rawData: jsonb("raw_data").notNull().$type<Record<string, unknown>>(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

// Durable employee-ID bridge from the "TeachOS ID Reference" upload/sync
// (instructor_user_id -> employee_id, plus the name on file at the time).
// Previously this data was only ever applied as a one-time patch onto
// whatever instructorsTable rows already existed
// (reconcileTeachosEmployeeIdReference in lib/reconcile.ts) and then
// discarded — so a later TeachOS upload/sync had no way to use it and could
// only match people by fuzzy full-name string equality, creating a
// duplicate "needs_review" record for anyone whose TeachOS name didn't
// closely match their Darwin name. Persisting it here lets
// reconcileTeachos() consult it directly during matching instead.
export const teachosIdReferenceTable = pgTable("teachos_id_reference", {
  id: serial("id").primaryKey(),
  instructorUserId: text("instructor_user_id").unique(),
  employeeId: text("employee_id").notNull(),
  fullName: text("full_name"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

// Aggregated per-instructor, per-course training-completion status, synced
// from the two "instructor learning status" BigQuery tables (see
// artifacts/api-server/src/lib/connectors/instructorLearningStatus.ts and
// artifacts/api-server/src/data/trainingCourseTaxonomy.ts, 2026-09-23, per
// request: track an instructor's OWN training/upskilling progress, distinct
// from the session-teaching completion the rest of this app already
// tracks). One row per (instructorUserId, courseKey) -- courseKey is a
// fixed slug from trainingCourseTaxonomy.ts (e.g. "react_js", "sql"), NOT a
// raw BigQuery course_title, since the taxonomy combines several
// near-duplicate real course_titles (e.g. "MongoDB" + "Mongo DB") into one
// tracked column. instructorUserId is BigQuery's own hex ID -- join against
// instructorsTable.teachosUserId to resolve a person (same key
// reconcileCapabilityManager() already uses), not stored as a foreign key
// here since a course-status row can arrive for an instructor_user_id this
// app hasn't matched to an employee_id yet.
//
// Full delete-then-insert on every sync (see storeTrainingStatus() in
// lib/storeRaw.ts) -- same convention as teachosDeploymentTable above, no
// unique constraint needed since the whole table is always replaced
// atomically inside one transaction.
export const instructorTrainingStatusTable = pgTable("instructor_training_status", {
  id: serial("id").primaryKey(),
  instructorUserId: text("instructor_user_id").notNull(),
  courseKey: text("course_key").notNull(),
  trackGroup: text("track_group").notNull(),
  // "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" -- derived per (instructor,
  // course) from the unit-level completion_status rows: >=95% COMPLETED ->
  // COMPLETED (2026-09-23, per request, after real data showed the earlier
  // "literally every unit" rule producing near-zero completions -- see
  // fetchCourseStatusRows()'s own comment in instructorLearningStatus.ts),
  // all YET_TO_START (zero progress) -> NOT_STARTED, else -> IN_PROGRESS.
  // There is no ON_HOLD value coming from BigQuery (confirmed live,
  // 2026-09-23 -- completion_status only ever has those 3 values) -- see
  // the Training Stats page for how that's surfaced.
  status: text("status").notNull(),
  unitsTotal: integer("units_total").notNull().default(0),
  unitsCompleted: integer("units_completed").notNull().default(0),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInstructorTrainingStatusSchema = createInsertSchema(instructorTrainingStatusTable);
export type InstructorTrainingStatus = typeof instructorTrainingStatusTable.$inferSelect;
export type InsertInstructorTrainingStatus = z.infer<typeof insertInstructorTrainingStatusSchema>;

// Aggregated per-instructor "Contribution" -- actual session-teaching hours
// delivered, sourced from BigQuery's niat_instructor_session_schedule_details
// (see artifacts/api-server/src/lib/connectors/instructorContribution.ts,
// 2026-09-24, per request: replace the manual Contribution sheet Ankush used
// to upload with a live BigQuery source, covering both Instructors and
// Mentors -- "create a new tab for employee contribution, where we have
// data of instructors as well mentor data there"). One row per
// instructorUserId (already aggregated in BigQuery, not one row per raw
// session) -- join against instructorsTable.teachosUserId to resolve a
// person, same key reconcileCapabilityManager()/the Training Stats join
// already use, since a contribution row can arrive for an instructor_user_id
// this app hasn't matched to an employee_id yet.
//
// Only COMPLETED sessions count toward these totals (a PENDING/scheduled
// session hasn't actually happened yet, so it isn't "hours worked"). Minutes
// are summed from session_duration_in_mins_from_schedule_time (computed
// live from each session's actual start/end datetime) rather than the
// table's separate session_duration column, which sample data showed
// returning a flat 60 regardless of the real scheduled window -- see
// fetchContributionRows()'s own comment in instructorContribution.ts.
//
// lectureMinutes/practiceMinutes cover session_type = 'LECTURE' / 'PRACTICE'
// respectively; otherMinutes is every other session_type (EXAM, and
// anything else that shows up later) bucketed together, per request ("how
// many hours of lecture session and also practice hours and also other
// hours he has worked") -- a catch-all rather than an exhaustive enum list,
// so a session_type this app has never seen before still lands somewhere
// instead of being silently dropped.
//
// Full delete-then-insert on every sync, same convention as
// instructorTrainingStatusTable above.
export const instructorContributionTable = pgTable("instructor_contribution", {
  id: serial("id").primaryKey(),
  instructorUserId: text("instructor_user_id").notNull(),
  lectureMinutes: integer("lecture_minutes").notNull().default(0),
  practiceMinutes: integer("practice_minutes").notNull().default(0),
  otherMinutes: integer("other_minutes").notNull().default(0),
  sessionsCompleted: integer("sessions_completed").notNull().default(0),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInstructorContributionSchema = createInsertSchema(instructorContributionTable);
export type InstructorContribution = typeof instructorContributionTable.$inferSelect;
export type InsertInstructorContribution = z.infer<typeof insertInstructorContributionSchema>;

export const insertInstructorSchema = createInsertSchema(instructorsTable);
export const insertUploadSchema = createInsertSchema(uploadsTable);
export const insertDarwinboxActiveSchema = createInsertSchema(darwinboxActiveTable);
export const insertDarwinboxExitsSchema = createInsertSchema(darwinboxExitsTable);
export const insertDarwinboxFullRosterSchema = createInsertSchema(darwinboxFullRosterTable);
export const insertTeachosDeploymentSchema = createInsertSchema(teachosDeploymentTable);
export const insertTeachosIdReferenceSchema = createInsertSchema(teachosIdReferenceTable);
export type Instructor = typeof instructorsTable.$inferSelect;
export type InsertInstructor = z.infer<typeof insertInstructorSchema>;
export type Upload = typeof uploadsTable.$inferSelect;
export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type DarwinboxActive = typeof darwinboxActiveTable.$inferSelect;
export type InsertDarwinboxActive = z.infer<typeof insertDarwinboxActiveSchema>;
export type DarwinboxExit = typeof darwinboxExitsTable.$inferSelect;
export type InsertDarwinboxExit = z.infer<typeof insertDarwinboxExitsSchema>;
export type DarwinboxFullRoster = typeof darwinboxFullRosterTable.$inferSelect;
export type InsertDarwinboxFullRoster = z.infer<typeof insertDarwinboxFullRosterSchema>;
export type TeachosDeployment = typeof teachosDeploymentTable.$inferSelect;
export type InsertTeachosDeployment = z.infer<typeof insertTeachosDeploymentSchema>;
export type TeachosIdReference = typeof teachosIdReferenceTable.$inferSelect;
export type InsertTeachosIdReference = z.infer<typeof insertTeachosIdReferenceSchema>;

// --- App login (Admin / Manager dashboard access) ---
// Two seeded accounts control what the deployed dashboard shows:
//  - "admin": every tab (Overview, Instructors, Darwin Breakdown, TeachOS
//    Breakdown, Source uploads).
//  - "manager": Overview + Instructors only (headcount and the
//    instructor/mentor/ops bifurcation) — no Darwin/TeachOS breakdown detail,
//    no uploads/sync. See requireRole() in
//    artifacts/api-server/src/middlewares/auth.ts for where this is enforced.
// This is unrelated to instructorsTable — that's faculty/instructor records,
// this is who may log into the CRM itself.
export const appUsersTable = pgTable("app_users", {
  id: serial("id").primaryKey(),
  // Always stored lowercased; compare against a lowercased input.
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  fullName: text("full_name").notNull(),
  // "admin" | "manager" — see comment above.
  role: text("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

// Opaque server-side session, looked up by the random token stored in the
// browser's httpOnly session_token cookie (see lib/auth.ts in api-server).
// Deliberately not a signed/JWT cookie — the token itself carries no claims,
// so there's nothing to sign; every request re-checks this row (and
// isActive/expiresAt) rather than trusting anything encoded client-side.
export const appSessionsTable = pgTable("app_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: integer("user_id").notNull().references(() => appUsersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAppSessionSchema = createInsertSchema(appSessionsTable).omit({ id: true, createdAt: true });
export type AppUser = typeof appUsersTable.$inferSelect;
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppSession = typeof appSessionsTable.$inferSelect;
export type InsertAppSession = z.infer<typeof insertAppSessionSchema>;
