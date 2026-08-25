import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";

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
  current_state: row.currentState,
  current_city: row.currentCity,
  darwin_employee_status: row.darwinEmployeeStatus,
  in_darwin: row.inDarwin,
  in_teachos: row.inTeachos,
  teachos_role: row.teachosRole,
  teachos_category: row.teachosCategory,
  teachos_manager: row.teachosManager,
  institutes: row.institutes,
  computed_status: row.computedStatus,
  manual_status: row.manualStatus,
  exit_date: row.exitDate,
  converted_university_name: row.convertedUniversityName,
  notes: row.notes,
});

router.get("/instructors", async (req, res) => {
  const { search, status, sub_department: subDepartment, designation, source } = req.query as Record<string, string | undefined>;
  const conditions = [];
  if (search) conditions.push(or(ilike(instructorsTable.fullName, `%${search}%`), ilike(instructorsTable.employeeId, `%${search}%`), ilike(instructorsTable.orgEmail, `%${search}%`)));
  if (status) conditions.push(or(eq(instructorsTable.manualStatus, status), eq(instructorsTable.computedStatus, status)));
  if (subDepartment) conditions.push(eq(instructorsTable.subDepartment, subDepartment));
  if (designation) conditions.push(eq(instructorsTable.designation, designation));
  if (source === "darwin") conditions.push(eq(instructorsTable.inDarwin, true));
  if (source === "teachos") conditions.push(eq(instructorsTable.inTeachos, true));
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

router.post("/instructors", async (req, res) => {
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

router.patch("/instructors/:id", async (req, res): Promise<void> => {
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

export default router;