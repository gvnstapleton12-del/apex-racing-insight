import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, racecardsTable, runnersTable } from "@workspace/db";
import { UploadRacesBody, UploadResultsBody } from "@workspace/api-zod";

const router: IRouter = Router();

// ── Column alias map ─────────────────────────────────────────────────────────
const ALIASES: Record<string, string[]> = {
  venue:          ["venue", "racecourse", "course", "track"],
  race_date:      ["race_date", "date"],
  race_time:      ["race_time", "time", "race time", "off time", "off"],
  race_name:      ["race_name", "race_type", "race type", "name", "race name", "type", "race title", "title"],
  distance:       ["distance", "dist"],
  going:          ["going", "ground", "going description"],
  class:          ["class", "race_class", "race class", "raceclass"],
  prize:          ["prize", "prize_win", "prize win", "prize money", "total prize"],
  horse_name:     ["horse_name", "horse", "horse name"],
  jockey:         ["jockey", "jock", "jockey name"],
  trainer:        ["trainer", "trainer name"],
  draw:           ["draw", "stall", "number", "cloth", "no"],
  weight:         ["weight", "wgt", "lbs", "st-lbs"],
  age:            ["age"],
  form:           ["form", "recent form"],
  odds:           ["odds", "sp", "price", "or", "official rating"],
  non_runners:    ["non_runners", "non runners", "nr"],
  track_profile:  ["track_profile", "track profile", "track notes"],
  market_context: ["market_context", "market context", "market"],
};

/** Return the value for a logical field from a row, checking all aliases. */
function col(row: Record<string, unknown>, field: string): string {
  const aliases = ALIASES[field] ?? [field];
  for (const alias of aliases) {
    const key = Object.keys(row).find(k => k.trim().toLowerCase() === alias.toLowerCase());
    if (key !== undefined && row[key] !== undefined && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
  }
  return "";
}

/** Detect if the spreadsheet is a combined runners-per-row format. */
function isCombinedFormat(rows: Record<string, unknown>[]): boolean {
  if (rows.length === 0) return false;
  const keys = Object.keys(rows[0]).map(k => k.trim().toLowerCase());
  const hasHorse = keys.some(k => ["horse name", "horse_name", "horse"].includes(k));
  const hasVenue = keys.some(k => ["racecourse", "venue", "course", "track"].includes(k));
  return hasHorse && hasVenue;
}

/** Detect if rows are a non-runners-only format (venue+time+horse, no date). */
function isNonRunnerFormat(rows: Record<string, unknown>[]): boolean {
  if (rows.length === 0) return false;
  const keys = Object.keys(rows[0]).map(k => k.trim().toLowerCase());
  const hasHorse = keys.some(k => ["horse name", "horse_name", "horse"].includes(k));
  const hasVenue = keys.some(k => ["racecourse", "venue", "course", "track"].includes(k));
  const hasTime  = keys.some(k => ["race_time", "time", "race time", "off time", "off"].includes(k));
  const hasDate  = keys.some(k => ["race_date", "date"].includes(k));
  return hasHorse && hasVenue && hasTime && !hasDate;
}

/** Normalise a time string – strip seconds if present (13:22:00 → 13:22). */
function normaliseTime(t: string): string {
  return t.replace(/:\d{2}$/, "").trim();
}

// ── POST /upload/races ────────────────────────────────────────────────────────
router.post("/upload/races", async (req, res): Promise<void> => {
  const parsed = UploadRacesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = parsed.data.data as Record<string, unknown>[];
  const errors: string[] = [];
  let racesInserted = 0;
  let runnersInserted = 0;

  // ── Non-runners format (venue + time + horse, no date) ───────────────────
  if (isNonRunnerFormat(rows)) {
    let nonRunnersMarked = 0;

    for (const row of rows) {
      const venue     = col(row, "venue");
      const time      = normaliseTime(col(row, "race_time"));
      const horseName = col(row, "horse_name");

      if (!venue || !time || !horseName) {
        errors.push(`Skipped row – missing Course/Time/Horse: ${JSON.stringify(row)}`);
        continue;
      }

      try {
        // Find the most recent racecard matching venue + time
        const [racecard] = await db
          .select({ id: racecardsTable.id })
          .from(racecardsTable)
          .where(and(
            eq(racecardsTable.venue, venue),
            eq(racecardsTable.raceTime, time),
          ))
          .orderBy(desc(racecardsTable.raceDate))
          .limit(1);

        if (!racecard) {
          errors.push(`No racecard found for ${venue} ${time} – skipping ${horseName}`);
          continue;
        }

        // If the runner already exists, mark them as a non-runner
        const [existing] = await db
          .select({ id: runnersTable.id })
          .from(runnersTable)
          .where(and(
            eq(runnersTable.racecardId, racecard.id),
            eq(runnersTable.horseName, horseName),
          ))
          .limit(1);

        if (existing) {
          await db
            .update(runnersTable)
            .set({ isNonRunner: true, scratched: true })
            .where(eq(runnersTable.id, existing.id));
        } else {
          // Add them as a new non-runner entry
          await db.insert(runnersTable).values({
            racecardId:  racecard.id,
            horseName,
            jockey:      col(row, "jockey")  || "",
            trainer:     col(row, "trainer") || "",
            weight:      "",
            isNonRunner: true,
            scratched:   true,
          });
        }
        nonRunnersMarked++;
      } catch (err) {
        errors.push(`Failed to process non-runner ${horseName}: ${String(err)}`);
      }
    }

    res.json({
      success: errors.length === 0,
      rowsProcessed: rows.length,
      rowsInserted: nonRunnersMarked,
      nonRunnersMarked,
      errors,
      message: `Marked ${nonRunnersMarked} non-runner${nonRunnersMarked !== 1 ? "s" : ""}`,
    });
    return;
  }

  // ── Combined format (one runner per row) ─────────────────────────────────
  if (isCombinedFormat(rows)) {
    const raceMap = new Map<string, { rows: Record<string, unknown>[]; racecardId?: number }>();

    for (const row of rows) {
      const venue = col(row, "venue");
      const date  = col(row, "race_date");
      const time  = normaliseTime(col(row, "race_time"));

      if (!venue || !time) {
        errors.push(`Skipped row – missing Racecourse/Time: ${JSON.stringify(row)}`);
        continue;
      }

      // Date is optional in combined format — fall back to finding existing racecard
      const key = `${date || "_"}||${venue}||${time}`;
      if (!raceMap.has(key)) raceMap.set(key, { rows: [] });
      raceMap.get(key)!.rows.push(row);
    }

    // Insert one racecard per unique race
    for (const [, entry] of raceMap) {
      const first     = entry.rows[0];
      const venue     = col(first, "venue");
      const date      = col(first, "race_date");
      const time      = normaliseTime(col(first, "race_time"));
      const raceName  = col(first, "race_name") || `${venue} ${time}`;
      const distance  = col(first, "distance");
      const going     = col(first, "going");
      const raceClass = col(first, "class");
      const prize     = col(first, "prize");
      const nonRunners = col(first, "non_runners");

      try {
        let racecardId: number;

        if (date) {
          // Full data — upsert by date+venue+time
          const existing = await db
            .select({ id: racecardsTable.id })
            .from(racecardsTable)
            .where(and(
              eq(racecardsTable.raceDate, date),
              eq(racecardsTable.venue, venue),
              eq(racecardsTable.raceTime, time),
            ))
            .limit(1);

          if (existing.length > 0) {
            racecardId = existing[0].id;
          } else {
            const [inserted] = await db.insert(racecardsTable).values({
              venue, raceDate: date, raceTime: time,
              raceName, distance, going, raceClass,
              prize:       prize       || undefined,
              nonRunners:  nonRunners  || undefined,
            }).returning();
            racecardId = inserted.id;
            racesInserted++;
          }
        } else {
          // No date — find matching racecard by venue+time
          const [match] = await db
            .select({ id: racecardsTable.id })
            .from(racecardsTable)
            .where(and(
              eq(racecardsTable.venue, venue),
              eq(racecardsTable.raceTime, time),
            ))
            .orderBy(desc(racecardsTable.raceDate))
            .limit(1);

          if (!match) {
            errors.push(`No existing racecard for ${venue} ${time} and no date supplied – skipping group`);
            continue;
          }
          racecardId = match.id;
        }

        entry.racecardId = racecardId;
      } catch (err) {
        errors.push(`Failed to insert race ${venue} ${time}: ${String(err)}`);
      }
    }

    // Insert runners
    for (const [, entry] of raceMap) {
      if (!entry.racecardId) continue;
      for (const row of entry.rows) {
        const horseName = col(row, "horse_name");
        if (!horseName) continue;
        try {
          await db.insert(runnersTable).values({
            racecardId:  entry.racecardId,
            horseName,
            jockey:  col(row, "jockey")  || "",
            trainer: col(row, "trainer") || "",
            weight:  col(row, "weight")  || "",
            draw:    col(row, "draw") ? parseInt(col(row, "draw"), 10) : undefined,
            age:     col(row, "age")  || undefined,
            form:    col(row, "form") || undefined,
            odds:    col(row, "odds") || undefined,
            isNonRunner: false,
            scratched:   false,
          });
          runnersInserted++;
        } catch (err) {
          errors.push(`Failed to insert runner ${horseName}: ${String(err)}`);
        }
      }
    }

    res.json({
      success: errors.length === 0,
      rowsProcessed: rows.length,
      rowsInserted: racesInserted,
      runnersInserted,
      racesInserted,
      errors,
      message: `Created ${racesInserted} race${racesInserted !== 1 ? "s" : ""} and ${runnersInserted} runner${runnersInserted !== 1 ? "s" : ""}`,
    });
    return;
  }

  // ── Simple races-only format ──────────────────────────────────────────────
  for (const row of rows) {
    const venue    = col(row, "venue");
    const date     = col(row, "race_date");
    const time     = normaliseTime(col(row, "race_time"));
    const raceName = col(row, "race_name");

    if (!venue || !date || !time) {
      errors.push(`Row missing required fields (venue/date/time): ${JSON.stringify(row)}`);
      continue;
    }
    try {
      await db.insert(racecardsTable).values({
        venue,
        raceDate:   date,
        raceTime:   time,
        raceName:   raceName || `${venue} ${time}`,
        distance:   col(row, "distance"),
        going:      col(row, "going"),
        raceClass:  col(row, "class"),
        prize:         col(row, "prize")          || undefined,
        nonRunners:    col(row, "non_runners")    || undefined,
      });
      racesInserted++;
    } catch (err) {
      errors.push(`Failed to insert row: ${String(err)}`);
    }
  }

  res.json({
    success: errors.length === 0,
    rowsProcessed: rows.length,
    rowsInserted: racesInserted,
    errors,
  });
});

// ── POST /upload/results ──────────────────────────────────────────────────────
router.post("/upload/results", async (req, res): Promise<void> => {
  const parsed = UploadResultsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = parsed.data.data as Record<string, unknown>[];
  const errors: string[] = [];
  let inserted = 0;

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const racecardId = col(r, "racecard_id") || String(r["racecard_id"] ?? "");
    const horseName  = col(r, "horse_name");
    if (!racecardId || !horseName) {
      errors.push(`Row missing racecard_id or horse_name: ${JSON.stringify(r)}`);
      continue;
    }
    try {
      await db.insert(runnersTable).values({
        racecardId:  Number(racecardId),
        horseName,
        jockey:  col(r, "jockey")  || "",
        trainer: col(r, "trainer") || "",
        weight:  col(r, "weight")  || "",
        draw:    col(r, "draw") ? parseInt(col(r, "draw"), 10) : undefined,
        age:     col(r, "age")  || undefined,
        form:    col(r, "form") || undefined,
        odds:    col(r, "odds") || undefined,
        isNonRunner: r["is_non_runner"] === "true" || r["is_non_runner"] === true,
        scratched:   r["scratched"]    === "true" || r["scratched"]    === true,
      });
      inserted++;
    } catch (err) {
      errors.push(`Failed to insert runner: ${String(err)}`);
    }
  }

  res.json({
    success: errors.length === 0,
    rowsProcessed: rows.length,
    rowsInserted: inserted,
    errors,
  });
});

export default router;
