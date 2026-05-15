import { Router, type IRouter } from "express";
import { eq, desc, and, like } from "drizzle-orm";
import { db, racecardsTable, runnersTable, apexScoresTable } from "@workspace/db";
import {
  ListRacecardsQueryParams,
  ListRacecardsResponseItem,
  CreateRacecardBody,
  GetRacecardParams,
  GetRacecardResponse,
  UpdateRacecardParams,
  UpdateRacecardBody,
  UpdateRacecardResponse,
  DeleteRacecardParams,
  GetRacecardAnalysisParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/racecards", async (req, res): Promise<void> => {
  const params = ListRacecardsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let query = db.select().from(racecardsTable).orderBy(desc(racecardsTable.raceDate), racecardsTable.raceTime);

  const conditions = [];
  if (params.data.date) {
    conditions.push(eq(racecardsTable.raceDate, params.data.date));
  }
  if (params.data.venue) {
    conditions.push(like(racecardsTable.venue, `%${params.data.venue}%`));
  }

  const racecards = await (conditions.length > 0
    ? db.select().from(racecardsTable).where(and(...conditions)).orderBy(desc(racecardsTable.raceDate), racecardsTable.raceTime)
    : db.select().from(racecardsTable).orderBy(desc(racecardsTable.raceDate), racecardsTable.raceTime));

  res.json(racecards.map(r => ListRacecardsResponseItem.parse(r)));
});

router.post("/racecards", async (req, res): Promise<void> => {
  const parsed = CreateRacecardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [racecard] = await db.insert(racecardsTable).values(parsed.data).returning();
  res.status(201).json(GetRacecardResponse.parse(racecard));
});

router.get("/racecards/:id", async (req, res): Promise<void> => {
  const params = GetRacecardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [racecard] = await db.select().from(racecardsTable).where(eq(racecardsTable.id, params.data.id));
  if (!racecard) {
    res.status(404).json({ error: "Racecard not found" });
    return;
  }

  res.json(GetRacecardResponse.parse(racecard));
});

router.patch("/racecards/:id", async (req, res): Promise<void> => {
  const params = UpdateRacecardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRacecardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [racecard] = await db.update(racecardsTable).set(parsed.data).where(eq(racecardsTable.id, params.data.id)).returning();
  if (!racecard) {
    res.status(404).json({ error: "Racecard not found" });
    return;
  }

  res.json(UpdateRacecardResponse.parse(racecard));
});

router.delete("/racecards/:id", async (req, res): Promise<void> => {
  const params = DeleteRacecardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(runnersTable).where(eq(runnersTable.racecardId, params.data.id));
  await db.delete(apexScoresTable).where(eq(apexScoresTable.racecardId, params.data.id));
  const [deleted] = await db.delete(racecardsTable).where(eq(racecardsTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Racecard not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/racecards/:id/runners", async (req, res): Promise<void> => {
  const params = GetRacecardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const runners = await db.select().from(runnersTable).where(eq(runnersTable.racecardId, params.data.id));
  res.json(runners);
});

router.get("/racecards/:id/analysis", async (req, res): Promise<void> => {
  const params = GetRacecardAnalysisParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [racecard] = await db.select().from(racecardsTable).where(eq(racecardsTable.id, params.data.id));
  if (!racecard) {
    res.status(404).json({ error: "Racecard not found" });
    return;
  }

  const runners = await db.select().from(runnersTable).where(eq(runnersTable.racecardId, params.data.id));
  const scores = await db.select().from(apexScoresTable).where(eq(apexScoresTable.racecardId, params.data.id));

  // Find top pick based on highest total score
  const topPickScore = scores.reduce<typeof scores[0] | null>((best, s) => {
    return !best || s.totalScore > best.totalScore ? s : best;
  }, null);

  const topPick = topPickScore ? runners.find(r => r.id === topPickScore.runnerId) || null : null;

  res.json({
    racecard,
    runners,
    scores,
    topPick: topPick || null,
    contextualSummary: racecard.marketContext || null,
  });
});

export default router;
