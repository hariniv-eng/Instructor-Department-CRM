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

// Public — no session required: health, Admin login/logout/me, and
// everything the no-login "Manager view" reads for the Overview +
// Instructors tabs (instructorRouter's GET routes, /reports/instructors).
// There is no "manager" login anymore (2026-09) — the Instructors tab's
// write routes (create/edit) self-protect with their own
// requireAuth+requireRole("admin") inside instructors.ts, and
// /reports/darwin-breakdown + /reports/teachos-breakdown self-protect the
// same way inside reports.ts, since the rest of each of those router files
// needs to stay public/mixed rather than gated as a whole at this level.
router.use(healthRouter);
router.use(authRouter);
router.use(instructorRouter);
router.use(reportsRouter);

// Admin-only: Darwin/TeachOS breakdown detail, source uploads, live syncs.
router.use(requireAuth, requireRole("admin"), dashboardRouter);
router.use(requireAuth, requireRole("admin"), uploadRouter);
router.use(requireAuth, requireRole("admin"), syncRouter);

export default router;
