// Persists each live-sync source into its own raw snapshot table
// (darwinbox_active / darwinbox_exits / teachos_deployment — see
// @workspace/db's schema). Each call fully replaces that table's rows with
// whatever was just fetched: delete-all then insert-fresh, inside one
// transaction, so a failed sync never leaves a half-replaced table.
//
// This deliberately does NOT touch `instructorsTable` and does NOT do any
// name/employeeId matching — the three sources are kept completely separate
// on purpose. Reconciling them into instructor records is a distinct step
// for later (see lib/reconcile.ts, which still runs for manual CSV/XLSX
// uploads on the Upload page — that path is unrelated to this one).

import {
  db,
  darwinboxActiveTable,
  darwinboxExitsTable,
  darwinboxFullRosterTable,
  teachosDeploymentTable,
  instructorTrainingStatusTable,
  instructorContributionTable,
} from "@workspace/db";
import { cell, type SheetRow } from "./reconcile";
import type { CourseStatusRow } from "./connectors/instructorLearningStatus";
import type { ContributionRow } from "./connectors/instructorContribution";

const CHUNK = 500;

export async function storeDarwinboxActive(rows: SheetRow[]): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.delete(darwinboxActiveTable);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((row) => ({
        employeeId: cell(row, "Employee Id", "employee_id"),
        fullName: cell(row, "Full Name", "full_name"),
        rawData: row,
      }));
      if (batch.length) await tx.insert(darwinboxActiveTable).values(batch);
    }
  });
  return rows.length;
}

export async function storeDarwinboxFullRoster(rows: SheetRow[]): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.delete(darwinboxFullRosterTable);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((row) => ({
        employeeId: cell(row, "Employee Id", "employee_id"),
        fullName: cell(row, "Full Name", "full_name"),
        rawData: row,
      }));
      if (batch.length) await tx.insert(darwinboxFullRosterTable).values(batch);
    }
  });
  return rows.length;
}

export async function storeDarwinboxExits(rows: SheetRow[]): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.delete(darwinboxExitsTable);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((row) => ({
        employeeId: cell(row, "Employee Id", "employee_id"),
        fullName: cell(row, "Full Name", "full_name"),
        rawData: row,
      }));
      if (batch.length) await tx.insert(darwinboxExitsTable).values(batch);
    }
  });
  return rows.length;
}

export async function storeTeachosDeployment(rows: SheetRow[]): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.delete(teachosDeploymentTable);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((row) => ({
        instructorUserId: cell(row, "instructor_user_id", "TeachOS User Id"),
        instructorName: cell(row, "instructor_name", "Instructor Name"),
        rawData: row,
      }));
      if (batch.length) await tx.insert(teachosDeploymentTable).values(batch);
    }
  });
  return rows.length;
}

// Instructor Training Status (2026-09-23) -- already aggregated server-side
// by fetchCourseStatusRows() (one row per instructor per tracked course, not
// per raw BigQuery unit row), so this is a much smaller replace than the
// others above, but same full delete-then-insert-in-one-transaction pattern.
export async function storeTrainingStatus(rows: CourseStatusRow[]): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.delete(instructorTrainingStatusTable);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((row) => ({
        instructorUserId: row.instructor_user_id,
        courseKey: row.course_key,
        trackGroup: row.track_group,
        status: row.status,
        unitsTotal: row.units_total,
        unitsCompleted: row.units_completed,
      }));
      if (batch.length) await tx.insert(instructorTrainingStatusTable).values(batch);
    }
  });
  return rows.length;
}

// Instructor Contribution (2026-09-24) -- already aggregated server-side by
// fetchContributionRows() (one row per instructor, not per raw session), so
// same small-replace pattern as storeTrainingStatus() above.
export async function storeContribution(rows: ContributionRow[]): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.delete(instructorContributionTable);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((row) => ({
        instructorUserId: row.instructor_user_id,
        lectureMinutes: row.lecture_minutes,
        practiceMinutes: row.practice_minutes,
        otherMinutes: row.other_minutes,
        sessionsCompleted: row.sessions_completed,
      }));
      if (batch.length) await tx.insert(instructorContributionTable).values(batch);
    }
  });
  return rows.length;
}
