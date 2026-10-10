// Movement Tracker (2026-10-09, per request): the Instructors tab's "Movement Tracker" and "Action Taken"
// columns. A Capability Manager logs a movement for an instructor (CM change, external move, DSA team, product
// move, deployment) with a remark, and whoever actions it marks "Action Taken" yes / no. Every movement is a new
// row in instructor_movements (full history, nothing overwritten); the table shows the latest one per instructor.
//
// Public, no requireAuth -- same as the other Capability-Manager-facing edits in routes/instructors.ts (gender,
// subject, exit verification): the Manager view carries no login session, so requireAuth would silently make this
// Admin-only. Because there is no session, who logged / actioned a movement is a name typed into the form.

import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db, instructorsTable, instructorMovementsTable } from "@workspace/db";

const router: IRouter = Router();

export const MOVEMENT_TYPES = ["cm_change", "external_move", "dsa_team", "product_move", "deployment_yes", "deployment_no"] as const;
const ACTION_VALUES = ["yes", "no"] as const;

const toApiMovement = (row: typeof instructorMovementsTable.$inferSelect) => ({
  id: row.id,
  instructor_id: row.instructorId,
  employee_id: row.employeeId,
  full_name: row.fullName,
  movement_type: row.movementType,
  remark: row.remark,
  requested_by: row.requestedBy,
  requested_at: row.requestedAt.toISOString(),
  action_taken: row.actionTaken,
  action_by: row.actionBy,
  action_at: row.actionAt ? row.actionAt.toISOString() : null,
});

const cleanText = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

// Newest first. Small table (one row per logged movement), so no paging.
router.get("/instructor-movements", async (_req, res): Promise<void> => {
  const rows = await db.select().from(instructorMovementsTable).orderBy(desc(instructorMovementsTable.requestedAt), asc(instructorMovementsTable.id));
  res.json({ movements: rows.map(toApiMovement) });
});

// One request can log several changes at once (2026-10-10, per request: e.g. a product move that also changes the
// Capability Manager). They are saved as separate rows with the SAME requested_at, which is how the table knows they
// belong together. The old single { movement_type, remark } body still works.
router.post("/instructors/:id/movements", async (req, res): Promise<void> => {
  const body = req.body as { movement_type?: unknown; remark?: unknown; requested_by?: unknown; changes?: unknown };
  const rawChanges: { movement_type?: unknown; remark?: unknown }[] = Array.isArray(body.changes)
    ? (body.changes as { movement_type?: unknown; remark?: unknown }[])
    : [{ movement_type: body.movement_type, remark: body.remark }];
  if (rawChanges.length === 0 || rawChanges.length > 10) {
    res.status(400).json({ error: "Log between 1 and 10 changes at a time." });
    return;
  }
  const changes: { movementType: string; remark: string }[] = [];
  for (const raw of rawChanges) {
    const movementType = typeof raw?.movement_type === "string" ? raw.movement_type : "";
    if (!MOVEMENT_TYPES.includes(movementType as (typeof MOVEMENT_TYPES)[number])) {
      res.status(400).json({ error: `movement_type must be one of: ${MOVEMENT_TYPES.join(", ")}` });
      return;
    }
    const remark = cleanText(raw?.remark, 1000);
    if (!remark) {
      res.status(400).json({ error: "Write a remark for every change (for a CM change, which Capability Manager it should change to)." });
      return;
    }
    changes.push({ movementType, remark });
  }
  // No "your name" field any more (2026-10-09, per request): the form doesn't ask who is logging it.
  const requestedBy = cleanText(body.requested_by, 120) || "Capability Manager";
  const [instructor] = await db.select().from(instructorsTable).where(eq(instructorsTable.id, Number(req.params.id)));
  if (!instructor) {
    res.status(404).json({ error: "Instructor not found" });
    return;
  }
  const requestedAt = new Date();
  const created = await db
    .insert(instructorMovementsTable)
    .values(changes.map((change) => ({ instructorId: instructor.id, employeeId: instructor.employeeId, fullName: instructor.fullName, movementType: change.movementType, remark: change.remark, requestedBy, requestedAt })))
    .returning();
  res.status(201).json({ movements: created.map(toApiMovement) });
});

// "Action Taken": yes / no, or null to clear it back to blank (not actioned yet).
router.patch("/instructor-movements/:movementId/action", async (req, res): Promise<void> => {
  const body = req.body as { action_taken?: unknown; action_by?: unknown };
  const action = body.action_taken;
  if (action !== null && !ACTION_VALUES.includes(action as (typeof ACTION_VALUES)[number])) {
    res.status(400).json({ error: 'action_taken must be "yes", "no", or null' });
    return;
  }
  const actionBy = cleanText(body.action_by, 120) || null;
  const [row] = await db
    .update(instructorMovementsTable)
    .set(action === null ? { actionTaken: null, actionBy: null, actionAt: null } : { actionTaken: action as string, actionBy, actionAt: new Date() })
    .where(eq(instructorMovementsTable.id, Number(req.params.movementId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Movement not found" });
    return;
  }
  res.json(toApiMovement(row));
});

export default router;
