import { Router, type IRouter } from "express";
import healthRouter from "./health";
import racecardsRouter from "./racecards";
import runnersRouter from "./runners";
import horsesRouter from "./horses";
import notesRouter from "./notes";
import scoresRouter from "./scores";
import calibrationRouter from "./calibration";
import dashboardRouter from "./dashboard";
import uploadRouter from "./upload";
import fetchRouter from "./fetch";

const router: IRouter = Router();

router.use(healthRouter);
router.use(racecardsRouter);
router.use(runnersRouter);
router.use(horsesRouter);
router.use(notesRouter);
router.use(scoresRouter);
router.use(calibrationRouter);
router.use(dashboardRouter);
router.use(uploadRouter);
router.use(fetchRouter);

export default router;
