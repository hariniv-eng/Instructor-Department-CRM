import { Router, type IRouter } from "express";
import healthRouter from "./health";
import instructorRouter from "./instructors";
import dashboardRouter from "./dashboard";
import uploadRouter from "./uploads";
import syncRouter from "./sync";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(instructorRouter);
router.use(dashboardRouter);
router.use(uploadRouter);
router.use(syncRouter);
router.use(reportsRouter);

export default router;
