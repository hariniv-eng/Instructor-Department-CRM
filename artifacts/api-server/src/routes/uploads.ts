import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, uploadsTable } from "@workspace/db";
import { reconcileDarwin, reconcileTeachos, reconcileExits, recomputeStatuses, type SheetRow } from "../lib/reconcile";

const router: IRouter = Router();
const toApiUpload = (row: typeof uploadsTable.$inferSelect) => ({ id: row.id, source: row.source, filename: row.filename, row_count: row.rowCount, uploaded_at: row.uploadedAt.toISOString() });

router.get("/uploads", async (_req, res) => res.json((await db.select().from(uploadsTable).orderBy(desc(uploadsTable.uploadedAt)).limit(20)).map(toApiUpload)));
router.post("/uploads", async (req, res) => {
  const body = req.body as { source: string; filename: string; row_count: number; rows?: SheetRow[] };
  if (body.rows?.length) {
    if (body.source === "Darwin") await reconcileDarwin(body.rows);
    if (body.source === "TeachOS") await reconcileTeachos(body.rows);
    if (body.source === "Exit List") await reconcileExits(body.rows);
    await recomputeStatuses();
  }
  const [row] = await db.insert(uploadsTable).values({ source: body.source, filename: body.filename, rowCount: body.row_count }).returning();
  res.status(201).json(toApiUpload(row));
});
export default router;
