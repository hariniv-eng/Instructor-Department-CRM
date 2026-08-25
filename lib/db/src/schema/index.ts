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
import { boolean, date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
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
  computedStatus: text("computed_status").notNull().default("needs_review"),
  manualStatus: text("manual_status"),
  exitDate: date("exit_date"),
  convertedUniversityName: text("converted_university_name"),
  notes: text("notes"),
});

export const uploadsTable = pgTable("uploads", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInstructorSchema = createInsertSchema(instructorsTable);
export const insertUploadSchema = createInsertSchema(uploadsTable);
export type Instructor = typeof instructorsTable.$inferSelect;
export type InsertInstructor = z.infer<typeof insertInstructorSchema>;
export type Upload = typeof uploadsTable.$inferSelect;
export type InsertUpload = z.infer<typeof insertUploadSchema>;