import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, calibrationEntriesTable, racecardsTable } from "@workspace/db";
import {
  GetDailyCalibrationQueryParams,
  SaveCalibrationEntryBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/calibration", async (req, res): Promise<void> => {
  const params = GetDailyCalibrationQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const date = params.data.date || new Date().toISOString().slice(0, 10);

  const entries = await db.select().from(calibrationEntriesTable)
    .where(eq(calibrationEntriesTable.date, date))
    .orderBy(calibrationEntriesTable.createdAt);

  const total = entries.length;
  const wins = entries.filter(e => e.outcome === "win").length;
  const places = entries.filter(e => e.outcome === "place").length;
  const unplaced = entries.filter(e => e.outcome === "unplaced").length;

  const bestOfDay = entries.filter(e => e.predictedClass === "best_of_day");
  const bestOfDayWins = bestOfDay.filter(e => e.outcome === "win").length;
  const hiddenValue = entries.filter(e => e.predictedClass === "hidden_value");
  const hiddenValueWins = hiddenValue.filter(e => e.outcome === "win" || e.outcome === "place").length;

  res.json({
    date,
    entries,
    summary: {
      totalPredictions: total,
      wins,
      places,
      unplaced,
      strikeRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
      placeRate: total > 0 ? Math.round(((wins + places) / total) * 1000) / 10 : 0,
      bestOfDayRecord: `${bestOfDayWins}/${bestOfDay.length}`,
      hiddenValueRecord: `${hiddenValueWins}/${hiddenValue.length}`,
    },
  });
});

router.post("/calibration", async (req, res): Promise<void> => {
  const parsed = SaveCalibrationEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [entry] = await db.insert(calibrationEntriesTable).values(parsed.data).returning();
  res.status(201).json(entry);
});

export default router;
