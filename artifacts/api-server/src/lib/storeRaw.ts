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
  teachosDeploymentTable,
} from "@workspace/db";
import { cell, type SheetRow } from "./reconcile";

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
