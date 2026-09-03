import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, uploadsTable, instructorsTable, teachosIdReferenceTable } from "@workspace/db";
import { reconcileDarwin, reconcileDarwinFullRosterFallback, reconcileTeachos, reconcileExits, reconcileTeachosEmployeeIdReference, recomputeStatuses, cell, type SheetRow } from "../lib/reconcile";

const router: IRouter = Router();
const toApiUpload = (row: typeof uploadsTable.$inferSelect) => ({ id: row.id, source: row.source, filename: row.filename, row_count: row.rowCount, uploaded_at: row.uploadedAt.toISOString() });

// Same "Instructors department" filter the live Darwinbox API sync applies
// (see isInstructorRecord() in lib/connectors/darwinbox.ts) — reimplemented
// against SheetRow's header-name-tolerant cell() lookup because a manually
// uploaded CSV carries column headers like "Department", not the raw API's
// lowercase "department" key.
const isInstructorRow = (row: SheetRow) => {
  const dept = cell(row, "Department", "department");
  return !!dept && dept.trim().toLowerCase().startsWith("instructors");
};

router.get("/uploads", async (_req, res) => res.json((await db.select().from(uploadsTable).orderBy(desc(uploadsTable.uploadedAt)).limit(20)).map(toApiUpload)));
router.post("/uploads", async (req, res) => {
  const body = req.body as { source: string; filename: string; row_count: number; rows?: SheetRow[] };
  if (body.rows?.length) {
    if (body.source === "Darwin") {
      // A manually uploaded "Darwin HRMS" file may be either the
      // Instructors-department-filtered export (what reconcileDarwin() has
      // always expected) or the full unfiltered company roster (needed for
      // reconcileDarwinFullRosterFallback() to find anyone — see
      // reconcile.ts). Support both from one upload, same as the live sync
      // does via fetchDarwinRowsBoth(): derive the filtered subset ourselves
      // when the upload turns out to be the full roster, and always run the
      // fallback pass against whatever was uploaded. If the file actually IS
      // already filtered to Instructors only, the fallback pass will simply
      // find 0 extra matches — harmless, just a no-op.
      const instructorRows = body.rows.every(isInstructorRow) ? body.rows : body.rows.filter(isInstructorRow);
      await reconcileDarwin(instructorRows);
      await reconcileDarwinFullRosterFallback(body.rows);
    }
    if (body.source === "TeachOS") await reconcileTeachos(body.rows);
    // These two are the employee-ID-mapping pipeline's reference files —
    // upload them any time after a TeachOS upload has populated the roster;
    // they only fill in fields on existing inTeachos=true rows, never create
    // new instructors. See TEACHOS_INSTRUCTOR_COUNT_RULES.md.
    if (body.source === "TeachOS ID Reference") await reconcileTeachosEmployeeIdReference(body.rows);
    // "Payroll Candidates" uploads no longer feed classification (removed
    // 2026-09-03 — payroll-converted status is now frozen to the
    // hand-maintained PAYROLL_CONVERTED_EMPLOYEES override list); the upload
    // option itself was also dropped from the frontend.
    if (body.source === "Exit List") await reconcileExits(body.rows);
    await recomputeStatuses();
  }
  const [row] = await db.insert(uploadsTable).values({ source: body.source, filename: body.filename, rowCount: body.row_count }).returning();
  res.status(201).json(toApiUpload(row));
});
// One-off admin endpoint for the pre-launch data-seeding phase — wipes the
// instructor register clean so a fresh Darwin/TeachOS/Payroll upload
// sequence starts from zero instead of layering onto leftover state from a
// prior (possibly buggy) reconciliation run. Reachable over the public
// deployment URL specifically because Workspace Shell scripts don't
// reliably share the deployed app's own DATABASE_URL/Secrets — running the
// wipe through this route guarantees it hits the exact DB the app is
// actually serving from. Requires a body of {"confirm": "RESET"} as a
// minimal guard against an accidental call — this is not real
// authentication and should be removed or properly secured before this CRM
// has real users depending on its data.
router.post("/admin/reset-instructors", async (req, res) => {
  const body = req.body as { confirm?: string };
  if (body.confirm !== "RESET") {
    res.status(400).json({ ok: false, error: 'Send {"confirm":"RESET"} in the request body to proceed.' });
    return;
  }
  await db.delete(instructorsTable);
  await db.delete(uploadsTable);
  await db.delete(teachosIdReferenceTable);
  res.json({ ok: true, message: "instructors, uploads, and teachos_id_reference tables cleared." });
});

export default router;
