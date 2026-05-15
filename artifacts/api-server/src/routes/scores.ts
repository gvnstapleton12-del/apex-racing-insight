import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, apexScoresTable } from "@workspace/db";
import {
  ListScoresQueryParams,
  CreateScoreBody,
  UpdateScoreParams,
  UpdateScoreBody,
  UpdateScoreResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function computeTotalScore(data: {
  abilityScore: number;
  paceFitScore: number;
  tacticalResilienceScore: number;
  groundTripScore: number;
  replayIntelligenceScore: number;
  hiddenValueScore: number;
  volatilityRisk: number;
}): number {
  // Weighted composite: volatility penalises the score
  const weighted =
    data.abilityScore * 0.25 +
    data.paceFitScore * 0.15 +
    data.tacticalResilienceScore * 0.15 +
    data.groundTripScore * 0.15 +
    data.replayIntelligenceScore * 0.15 +
    data.hiddenValueScore * 0.15 -
    data.volatilityRisk * 0.1;

  return Math.max(0, Math.min(100, Math.round(weighted * 10) / 10));
}

router.get("/scores", async (req, res): Promise<void> => {
  const params = ListScoresQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions = [];
  if (params.data.runnerId != null) {
    conditions.push(eq(apexScoresTable.runnerId, params.data.runnerId));
  }
  if (params.data.racecardId != null) {
    conditions.push(eq(apexScoresTable.racecardId, params.data.racecardId));
  }

  const scores = conditions.length > 0
    ? await db.select().from(apexScoresTable).where(and(...conditions))
    : await db.select().from(apexScoresTable);

  res.json(scores);
});

router.post("/scores", async (req, res): Promise<void> => {
  const parsed = CreateScoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const totalScore = computeTotalScore(parsed.data);

  const [score] = await db.insert(apexScoresTable).values({ ...parsed.data, totalScore }).returning();
  res.status(201).json(score);
});

router.patch("/scores/:id", async (req, res): Promise<void> => {
  const params = UpdateScoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateScoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Get existing record to recompute total
  const [existing] = await db.select().from(apexScoresTable).where(eq(apexScoresTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Score not found" });
    return;
  }

  const merged = { ...existing, ...parsed.data };
  const totalScore = computeTotalScore(merged);

  const [score] = await db.update(apexScoresTable)
    .set({ ...parsed.data, totalScore, updatedAt: new Date() })
    .where(eq(apexScoresTable.id, params.data.id))
    .returning();

  res.json(UpdateScoreResponse.parse(score));
});

export default router;
