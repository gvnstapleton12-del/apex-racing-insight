import { Router, type IRouter } from "express";
import { db, racecardsTable, runnersTable } from "@workspace/db";
import {
  UploadRacesBody,
  UploadResultsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/upload/races", async (req, res): Promise<void> => {
  const parsed = UploadRacesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const errors: string[] = [];
  let inserted = 0;

  for (const row of parsed.data.data) {
    try {
      const r = row as Record<string, unknown>;
      if (!r["venue"] || !r["race_date"] || !r["race_time"] || !r["race_name"]) {
        errors.push(`Row missing required fields: ${JSON.stringify(r)}`);
        continue;
      }

      await db.insert(racecardsTable).values({
        venue: String(r["venue"]),
        raceDate: String(r["race_date"] ?? r["date"] ?? ""),
        raceTime: String(r["race_time"] ?? r["time"] ?? ""),
        raceName: String(r["race_name"] ?? r["name"] ?? ""),
        distance: String(r["distance"] ?? ""),
        going: String(r["going"] ?? ""),
        raceClass: String(r["class"] ?? r["race_class"] ?? ""),
        prize: r["prize"] ? String(r["prize"]) : undefined,
        trackProfile: r["track_profile"] ? String(r["track_profile"]) : undefined,
        marketContext: r["market_context"] ? String(r["market_context"]) : undefined,
        trainerComments: r["trainer_comments"] ? String(r["trainer_comments"]) : undefined,
        nonRunners: r["non_runners"] ? String(r["non_runners"]) : undefined,
      });
      inserted++;
    } catch (err) {
      errors.push(`Failed to insert row: ${String(err)}`);
    }
  }

  res.json({
    success: errors.length === 0,
    rowsProcessed: parsed.data.data.length,
    rowsInserted: inserted,
    errors,
  });
});

router.post("/upload/results", async (req, res): Promise<void> => {
  const parsed = UploadResultsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const errors: string[] = [];
  let inserted = 0;

  for (const row of parsed.data.data) {
    try {
      const r = row as Record<string, unknown>;
      if (!r["racecard_id"] || !r["horse_name"]) {
        errors.push(`Row missing required fields: ${JSON.stringify(r)}`);
        continue;
      }

      await db.insert(runnersTable).values({
        racecardId: Number(r["racecard_id"]),
        horseName: String(r["horse_name"]),
        jockey: String(r["jockey"] ?? ""),
        trainer: String(r["trainer"] ?? ""),
        draw: r["draw"] ? Number(r["draw"]) : undefined,
        weight: String(r["weight"] ?? ""),
        age: r["age"] ? String(r["age"]) : undefined,
        form: r["form"] ? String(r["form"]) : undefined,
        odds: r["odds"] ? String(r["odds"]) : undefined,
        isNonRunner: r["is_non_runner"] === "true" || r["is_non_runner"] === true,
        scratched: r["scratched"] === "true" || r["scratched"] === true,
      });
      inserted++;
    } catch (err) {
      errors.push(`Failed to insert row: ${String(err)}`);
    }
  }

  res.json({
    success: errors.length === 0,
    rowsProcessed: parsed.data.data.length,
    rowsInserted: inserted,
    errors,
  });
});

export default router;
