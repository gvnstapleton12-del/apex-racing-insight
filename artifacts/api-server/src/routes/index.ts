import { Router } from "express";
import healthRouter from "./health.js";
import racecardsRouter from "./racecards.js";
import runnersRouter from "./runners.js";
import horsesRouter from "./horses.js";
import notesRouter from "./notes.js";
import scoresRouter from "./scores.js";
import calibrationRouter from "./calibration.js";
import dashboardRouter from "./dashboard.js";
import uploadRouter from "./upload.js";
import fetchRouter from "./fetch.js";

const router = Router();

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
