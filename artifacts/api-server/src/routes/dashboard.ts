import { Router, type IRouter } from "express";
import { desc, eq, count } from "drizzle-orm";
import { db, racecardsTable, horsesTable, runnersTable, apexScoresTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);

  const [racecardCount] = await db.select({ value: count() }).from(racecardsTable);
  const [horseCount] = await db.select({ value: count() }).from(horsesTable);
  const [runnerCount] = await db.select({ value: count() }).from(runnersTable);

  const recentRaces = await db.select().from(racecardsTable)
    .orderBy(desc(racecardsTable.raceDate), racecardsTable.raceTime)
    .limit(5);

  const allScores = await db.select().from(apexScoresTable);

  const confidenceBreakdown = {
    bestOfDay: allScores.filter(s => s.confidenceClass === "best_of_day").length,
    topRatedHighVariance: allScores.filter(s => s.confidenceClass === "top_rated_high_variance").length,
    hiddenValue: allScores.filter(s => s.confidenceClass === "hidden_value").length,
    replayUpgrade: allScores.filter(s => s.confidenceClass === "replay_upgrade").length,
    noBet: allScores.filter(s => s.confidenceClass === "no_bet").length,
  };

  const todayRaces = await db.select().from(racecardsTable).where(eq(racecardsTable.raceDate, today));

  res.json({
    totalRacecards: racecardCount?.value ?? 0,
    totalHorses: horseCount?.value ?? 0,
    totalRunners: runnerCount?.value ?? 0,
    recentRaces,
    confidenceBreakdown,
    todayRaceCount: todayRaces.length,
  });
});

export default router;
