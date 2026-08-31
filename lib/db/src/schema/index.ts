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
  currentState: text("current_state"),
  currentCity: text("current_city"),
  darwinEmployeeStatus: text("darwin_employee_status"),
  inDarwin: boolean("in_darwin").notNull().default(false),
  inTeachos: boolean("in_teachos").notNull().default(false),
  teachosRole: text("teachos_role"),
  teachosCategory: text("teachos_category"),
  teachosManager: text("teachos_manager"),
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
  // department string) was available to classify from.
  deptArea: text("dept_area"),
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

export const insertInstructorSchema = createInsertSchema(instructorsTable);
export const insertUploadSchema = createInsertSchema(uploadsTable);
export const insertDarwinboxActiveSchema = createInsertSchema(darwinboxActiveTable);
export const insertDarwinboxExitsSchema = createInsertSchema(darwinboxExitsTable);
export const insertDarwinboxFullRosterSchema = createInsertSchema(darwinboxFullRosterTable);
export const insertTeachosDeploymentSchema = createInsertSchema(teachosDeploymentTable);
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
