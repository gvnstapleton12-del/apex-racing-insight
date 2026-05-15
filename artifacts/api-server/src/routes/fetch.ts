import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, racecardsTable, runnersTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const RACING_API_BASE = "https://api.theracingapi.com/v1";

interface ApiRunner {
  horse?: string;
  horse_id?: string;
  jockey?: string;
  trainer?: string;
  number?: number;
  draw?: number;
  age?: string;
  weight_lbs?: number;
  form?: string;
  official_rating?: string;
  sp?: string | null;
  non_runner?: boolean;
}

interface ApiRacecard {
  race_id?: string;
  course?: string;
  date?: string;
  off_time?: string;
  off_dt?: string;
  race_name?: string;
  distance_f?: string;
  distance_round?: string;
  distance?: string;
  going?: string;
  going_detailed?: string;
  race_class?: string;
  prize?: string | number;
  field_size?: number;
  runners?: ApiRunner[];
}

interface ApiNonRunner {
  horse?: string;
  horse_id?: string;
  course?: string;
  off_time?: string;
  race_id?: string;
  date?: string;
  reason?: string;
}

function normaliseTime(t: string): string {
  const parts = t.trim().split(":");
  if (parts.length >= 3) return `${parts[0]}:${parts[1]}`;
  if (parts.length === 2) return t.trim();
  return `${t.trim()}:00`;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function apiGet(path: string, username: string, password: string, retries = 2) {
  const url = `${RACING_API_BASE}${path}`;
  const credentials = Buffer.from(`${username}:${password}`).toString("base64");

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1500);
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
      },
    });
    if (res.status === 429) {
      if (attempt < retries) continue;   // wait and retry
      const body = await res.text();
      throw new Error(`Racing API rate limit hit: ${body}`);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Racing API ${res.status}: ${body}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }
  throw new Error("Racing API: all retries exhausted");
}

// POST /api/fetch/today
router.post("/fetch/today", async (req, res): Promise<void> => {
  const { username, password, date } = req.body as {
    username?: string;
    password?: string;
    date?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const targetDate = date || new Date().toISOString().slice(0, 10);
  let racesInserted = 0;
  let racesSkipped = 0;
  let runnersInserted = 0;
  let nonRunnersMarked = 0;
  const errors: string[] = [];

  // ── 1. Fetch racecards ───────────────────────────────────────────────────
  let racecards: ApiRacecard[] = [];
  try {
    const data = await apiGet(`/racecards/free?date=${targetDate}`, username, password);
    racecards = (data["racecards"] as ApiRacecard[]) ?? [];
    // Some endpoints return results at top level as array
    if (!Array.isArray(racecards) && Array.isArray(data)) {
      racecards = data as unknown as ApiRacecard[];
    }
  } catch (err) {
    // Try without date param (some free tiers only do today)
    try {
      const data = await apiGet("/racecards/free", username, password);
      racecards = (data["racecards"] as ApiRacecard[]) ?? [];
      if (!Array.isArray(racecards) && Array.isArray(data)) {
        racecards = data as unknown as ApiRacecard[];
      }
    } catch (err2) {
      res.status(502).json({
        error: `Could not fetch racecards: ${String(err2)}. Check credentials.`,
      });
      return;
    }
  }

  logger.info({ count: racecards.length, date: targetDate }, "Fetched racecards from Racing API");

  for (const rc of racecards) {
    const venue    = rc.course ?? "";
    const raceDate = rc.date ?? targetDate;
    const raceTime = normaliseTime(rc.off_time ?? "");
    const raceName = rc.race_name ?? `${venue} ${raceTime}`;
    const distance = rc.distance_f ?? rc.distance_round ?? rc.distance ?? "";
    const going    = rc.going_detailed ?? rc.going ?? "";
    const raceClass = rc.race_class ?? "";
    const prize    = rc.prize != null ? String(rc.prize) : undefined;

    if (!venue || !raceDate || !raceTime) {
      errors.push(`Skipped race with missing fields: ${JSON.stringify(rc)}`);
      continue;
    }

    try {
      const existing = await db
        .select({ id: racecardsTable.id })
        .from(racecardsTable)
        .where(and(
          eq(racecardsTable.raceDate, raceDate),
          eq(racecardsTable.venue, venue),
          eq(racecardsTable.raceTime, raceTime),
        ))
        .limit(1);

      let racecardId: number;
      if (existing.length > 0) {
        racecardId = existing[0].id;
        racesSkipped++;
      } else {
        const [inserted] = await db.insert(racecardsTable).values({
          venue, raceDate, raceTime, raceName, distance, going, raceClass,
          prize: prize ?? undefined,
        }).returning();
        racecardId = inserted.id;
        racesInserted++;
      }

      // Insert runners
      const runners = rc.runners ?? [];
      for (const runner of runners) {
        const horseName = runner.horse ?? "";
        if (!horseName) continue;
        if (runner.non_runner) {
          nonRunnersMarked++;
          try {
            const [existingRunner] = await db
              .select({ id: runnersTable.id })
              .from(runnersTable)
              .where(and(eq(runnersTable.racecardId, racecardId), eq(runnersTable.horseName, horseName)))
              .limit(1);
            if (existingRunner) {
              await db.update(runnersTable).set({ isNonRunner: true, scratched: true }).where(eq(runnersTable.id, existingRunner.id));
            } else {
              await db.insert(runnersTable).values({
                racecardId, horseName,
                jockey: runner.jockey ?? "", trainer: runner.trainer ?? "", weight: "",
                isNonRunner: true, scratched: true,
              });
            }
          } catch (e) { errors.push(`NR ${horseName}: ${String(e)}`); }
          continue;
        }
        try {
          await db.insert(runnersTable).values({
            racecardId,
            horseName,
            jockey:  runner.jockey  ?? "",
            trainer: runner.trainer ?? "",
            weight:  runner.weight_lbs != null ? `${runner.weight_lbs}lbs` : "",
            draw:    runner.draw   ?? runner.number ?? undefined,
            age:     runner.age    ?? undefined,
            form:    runner.form   ?? undefined,
            odds:    runner.official_rating ?? runner.sp ?? undefined,
            isNonRunner: false,
            scratched:   false,
          });
          runnersInserted++;
        } catch (e) { errors.push(`Runner ${horseName}: ${String(e)}`); }
      }
    } catch (err) {
      errors.push(`Race ${venue} ${raceTime}: ${String(err)}`);
    }
  }

  // ── 2. Fetch non-runners (best-effort — may not be on free tier) ─────────
  try {
    const data = await apiGet(`/non-runners?date=${targetDate}`, username, password);
    const nrs = (data["non_runners"] as ApiNonRunner[]) ?? [];

    for (const nr of nrs) {
      const horseName = nr.horse ?? "";
      const venue     = nr.course ?? "";
      const time      = normaliseTime(nr.off_time ?? "");
      if (!horseName || !venue || !time) continue;

      try {
        const [racecard] = await db
          .select({ id: racecardsTable.id })
          .from(racecardsTable)
          .where(and(eq(racecardsTable.venue, venue), eq(racecardsTable.raceTime, time)))
          .limit(1);

        const rcId = racecard?.id;
        if (!rcId) continue;

        const [existing] = await db
          .select({ id: runnersTable.id })
          .from(runnersTable)
          .where(and(eq(runnersTable.racecardId, rcId), eq(runnersTable.horseName, horseName)))
          .limit(1);

        if (existing) {
          await db.update(runnersTable).set({ isNonRunner: true, scratched: true }).where(eq(runnersTable.id, existing.id));
        } else {
          await db.insert(runnersTable).values({
            racecardId: rcId, horseName,
            jockey: "", trainer: "", weight: "",
            isNonRunner: true, scratched: true,
          });
        }
        nonRunnersMarked++;
      } catch (e) { errors.push(`NR ${horseName}: ${String(e)}`); }
    }
  } catch {
    // Non-runners endpoint may not be on free tier — silently skip
  }

  res.json({
    success: errors.length === 0,
    date: targetDate,
    racesInserted,
    racesSkipped,
    runnersInserted,
    nonRunnersMarked,
    errors,
    message: `Imported ${racesInserted} races, ${runnersInserted} runners, ${nonRunnersMarked} non-runners (${racesSkipped} races already existed)`,
  });
});

export default router;
