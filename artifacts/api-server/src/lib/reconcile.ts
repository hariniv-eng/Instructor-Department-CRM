// Name-matching + reconciliation logic — extracted out of routes/uploads.ts
// (unchanged) so routes/sync.ts (live Darwinbox/BigQuery sync) can reuse the
// exact same matching behavior instead of duplicating it. Manual CSV/XLSX
// uploads and live API syncs now both go through these same functions, so
// behavior stays identical regardless of where the rows came from.

import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";

export type SheetRow = Record<string, unknown>;

export const cell = (row: SheetRow, ...keys: string[]) => {
  const found = Object.entries(row).find(([key]) => keys.some((candidate) => key.trim().toLowerCase() === candidate.toLowerCase()));
  return found?.[1] === undefined || found[1] === null ? null : String(found[1]).trim() || null;
};

export const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

export const findMatch = (rows: Array<typeof instructorsTable.$inferSelect>, name: string | null, employeeId?: string | null) => {
  if (employeeId) {
    const employee = rows.find((item) => item.employeeId === employeeId);
    if (employee) return employee;
  }
  if (!name) return undefined;
  const normalized = normalize(name);
  return rows.find((item) => normalize(item.fullName) === normalized) ?? rows.find((item) => normalize(item.fullName).replaceAll(" ", "") === normalized.replaceAll(" ", ""));
};

export const similarity = (left: string, right: string) => {
  const source = normalize(left);
  const target = normalize(right);
  const matrix = Array.from({ length: source.length + 1 }, (_, row) => Array.from({ length: target.length + 1 }, (_, column) => row === 0 ? column : column === 0 ? row : 0));
  for (let row = 1; row <= source.length; row += 1) for (let column = 1; column <= target.length; column += 1) matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + (source[row - 1] === target[column - 1] ? 0 : 1));
  return source && target ? 1 - matrix[source.length][target.length] / Math.max(source.length, target.length) : 0;
};

export const possibleMatchNote = (rows: Array<typeof instructorsTable.$inferSelect>, name: string) => {
  const candidate = rows.map((row) => ({ name: row.fullName, score: similarity(name, row.fullName) })).sort((left, right) => right.score - left.score)[0];
  return candidate && candidate.score >= 0.62 && candidate.score < 1 ? `Possible match: ${candidate.name} (${Math.round(candidate.score * 100)}% confidence). Review before merging.` : null;
};

export const recomputeStatuses = async () => {
  const rows = await db.select().from(instructorsTable);
  await Promise.all(rows.map((row) => db.update(instructorsTable).set({
    computedStatus: row.inDarwin && row.darwinEmployeeStatus === "Active" ? "active" : row.inDarwin && !row.inTeachos ? "pending_deployment" : "needs_review",
  }).where(eq(instructorsTable.id, row.id))));
};

export async function reconcileDarwin(rows: SheetRow[]) {
  let newCount = 0;
  let matchedCount = 0;
  await db.update(instructorsTable).set({ inDarwin: false, darwinEmployeeStatus: null });
  const people = await db.select().from(instructorsTable);
  for (const item of rows) {
    const fullName = cell(item, "Full Name", "full_name");
    const employeeId = cell(item, "Employee Id", "employee_id");
    if (!fullName) continue;
    const match = findMatch(people, fullName, employeeId);
    const values = {
      employeeId,
      fullName,
      orgEmail: cell(item, "Org Email Id", "org_email"),
      mobile: cell(item, "Primary Mobile Number", "mobile"),
      dateOfJoining: cell(item, "Date Of Joining", "date_of_joining"),
      department: cell(item, "Department", "department"),
      subDepartment: cell(item, "Sub Department", "sub_department"),
      designation: cell(item, "Designation", "designation"),
      directManager: cell(item, "Direct Manager", "direct_manager"),
      workLocation: cell(item, "Work Location", "work_location"),
      workspace: cell(item, "Workspace", "workspace"),
      gender: cell(item, "Gender", "gender"),
      currentState: cell(item, "Current State", "current_state"),
      currentCity: cell(item, "Current City", "current_city"),
      darwinEmployeeStatus: cell(item, "Employee Status", "darwin_employee_status") ?? "Active",
      inDarwin: true,
    };
    if (match) {
      await db.update(instructorsTable).set(values).where(eq(instructorsTable.id, match.id));
      matchedCount += 1;
    } else {
      const [created] = await db.insert(instructorsTable).values({ ...values, inTeachos: false, institutes: [], computedStatus: "pending_deployment", notes: possibleMatchNote(people, fullName) }).returning();
      people.push(created);
      newCount += 1;
    }
  }
  return { new: newCount, matched: matchedCount, total_rows: rows.length };
}

export async function reconcileTeachos(rows: SheetRow[]) {
  let newCount = 0;
  let matchedCount = 0;
  await db.update(instructorsTable).set({ inTeachos: false, teachosRole: null, teachosCategory: null, teachosManager: null, institutes: [] });
  const people = await db.select().from(instructorsTable);
  for (const item of rows) {
    const fullName = cell(item, "instructor_name", "Instructor Name");
    if (!fullName) continue;
    const match = findMatch(people, fullName);
    const institute = cell(item, "institute_name", "Institute Name");
    const values = {
      teachosUserId: cell(item, "instructor_user_id", "TeachOS User Id"),
      fullName,
      teachosRole: cell(item, "instructor_role", "Instructor Role"),
      teachosCategory: cell(item, "instructor_category", "Instructor Category"),
      teachosManager: cell(item, "instructor_manager", "Instructor Manager"),
      inTeachos: true,
      institutes: institute ? [institute] : [],
    };
    if (match) {
      const institutes = institute ? Array.from(new Set([...match.institutes, institute])) : match.institutes;
      await db.update(instructorsTable).set({ ...values, institutes }).where(eq(instructorsTable.id, match.id));
      match.institutes = institutes;
      matchedCount += 1;
    } else {
      const [created] = await db.insert(instructorsTable).values({ ...values, inDarwin: false, computedStatus: "needs_review", notes: possibleMatchNote(people, fullName) }).returning();
      people.push(created);
      newCount += 1;
    }
  }
  return { new: newCount, matched: matchedCount, total_rows: rows.length };
}

export async function reconcileExits(rows: SheetRow[]) {
  let matchedCount = 0;
  let unmatchedCount = 0;
  const people = await db.select().from(instructorsTable);
  for (const item of rows) {
    const match = findMatch(people, cell(item, "Full Name", "full_name"), cell(item, "Employee Id", "employee_id"));
    if (!match) {
      unmatchedCount += 1;
      continue;
    }
    await db.update(instructorsTable).set({
      manualStatus: "exited",
      exitDate: cell(item, "Exit Date", "exit_date"),
      notes: cell(item, "Reason", "reason") ?? match.notes,
    }).where(eq(instructorsTable.id, match.id));
    matchedCount += 1;
  }
  return { matched: matchedCount, unmatched: unmatchedCount, total_rows: rows.length };
}
