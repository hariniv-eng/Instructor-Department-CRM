import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import instructorRouter from "./instructors";
import dashboardRouter from "./dashboard";
import uploadRouter from "./uploads";
import syncRouter from "./sync";
import reportsRouter from "./reports";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// Public — no session required.
router.use(healthRouter);
router.use(authRouter);

// Both admin and manager: the Overview + Instructors tabs read these.
// (reportsRouter also serves /reports/darwin-breakdown and
// /reports/teachos-breakdown, which are further restricted to admin-only
// via a per-route requireRole("admin") inside reports.ts itself.)
router.use(requireAuth, instructorRouter);
router.use(requireAuth, reportsRouter);

// Admin-only: Darwin/TeachOS breakdown detail, source uploads, live syncs.
router.use(requireAuth, requireRole("admin"), dashboardRouter);
router.use(requireAuth, requireRole("admin"), uploadRouter);
router.use(requireAuth, requireRole("admin"), syncRouter);

export default router;
