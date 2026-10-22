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
  darwinboxActiveTable,
  darwinboxExitsTable,
  darwinboxFullRosterTable,
  teachosDeploymentTable,
  instructorTrainingStatusTable,
  instructorTaughtCourseTable,
  instructorContributionTable,
  instructorContributionDailyTable,
  instructorEvaluationDailyTable,
  instructorTimeSpentDailyTable,
} from "@workspace/db";
import { sdb as db } from "./syncContext";
import { cell, type SheetRow } from "./reconcile";
import type { CourseStatusRow } from "./connectors/instructorLearningStatus";
import type { TaughtCourseRow } from "./connectors/taughtTraining";
import type { ContributionRow, ContributionDailyRow } from "./connectors/instructorContribution";
import type { EvaluationDailyRow } from "./connectors/instructorEvaluations";
import type { TimeSpentDailyRow } from "./connectors/instructorTimeSpent";

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

// "Taught in class" training (2026-10-19): fully replaced on every Training Status sync, like storeTrainingStatus() above.
export async function storeTaughtCourses(rows: TaughtCourseRow[]): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.delete(instructorTaughtCourseTable);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((row) => ({
        instructorUserId: row.instructor_user_id,
        courseId: row.course_id,
        courseTitle: row.course_title,
        courseSubject: row.course_subject,
        topicsTotal: row.topics_total,
        topicsTaught: row.topics_taught,
        taughtTopics: row.taught_topics,
        sessionsCompleted: row.sessions_completed,
        firstTaughtDate: row.first_taught_date,
        lastTaughtDate: row.last_taught_date,
        curriculumSessions: row.curriculum_sessions,
        completedSessions: row.completed_sessions,
        scheduledSessions: row.scheduled_sessions,
        institutes: row.institutes,
        portalCourseKey: row.portal_course_key,
        portalMatchPct: row.portal_match_pct,
      }));
      if (batch.length) await tx.insert(instructorTaughtCourseTable).values(batch);
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
        lectureSessions: row.lecture_sessions,
        practiceSessions: row.practice_sessions,
        otherSessions: row.other_sessions,
        sessionDays: row.session_days,
        deploymentDate: row.deployment_date,
        allBatches: row.all_batches,
        recentBatches: row.recent_batches,
        niatCohorts: row.niat_cohorts,
        sessionSubjects: row.session_subjects ?? {},
      }));
      if (batch.length) await tx.insert(instructorContributionTable).values(batch);
    }
  });
  return rows.length;
}

// Per-day contribution rows (2026-10-12) -- backs the Contribution tab's date filter. Full replace, like the table above.
export async function storeContributionDaily(rows: ContributionDailyRow[]): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.delete(instructorContributionDailyTable);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((row) => ({
        instructorUserId: row.instructor_user_id,
        sessionDate: row.session_date,
        lectureMinutes: row.lecture_minutes,
        practiceMinutes: row.practice_minutes,
        otherMinutes: row.other_minutes,
        lectureSessions: row.lecture_sessions,
        practiceSessions: row.practice_sessions,
        otherSessions: row.other_sessions,
      }));
      if (batch.length) await tx.insert(instructorContributionDailyTable).values(batch);
    }
  });
  return rows.length;
}

// Demo / AI-assessment hours per instructor per day (2026-10-14): full replace, same as the Contribution daily table.
export async function storeEvaluationDaily(rows: EvaluationDailyRow[]): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.delete(instructorEvaluationDailyTable);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((row) => ({
        instructorUserId: row.instructor_user_id,
        sessionDate: row.session_date,
        evaluationType: row.evaluation_type,
        seconds: row.seconds,
        evaluations: row.evaluations,
        scoreSum: row.score_sum,
        scored: row.scored,
      }));
      if (batch.length) await tx.insert(instructorEvaluationDailyTable).values(batch);
    }
  });
  return rows.length;
}

// Learning time per instructor per day (2026-10-15): full delete-then-insert, same shape as storeEvaluationDaily().
export async function storeTimeSpentDaily(rows: TimeSpentDailyRow[]): Promise<number> {
  await db.transaction(async (tx) => {
    await tx.delete(instructorTimeSpentDailyTable);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((row) => ({
        instructorUserId: row.instructor_user_id,
        activityDate: row.activity_date,
        seconds: row.seconds,
        units: row.units,
      }));
      if (batch.length) await tx.insert(instructorTimeSpentDailyTable).values(batch);
    }
  });
  return rows.length;
}
