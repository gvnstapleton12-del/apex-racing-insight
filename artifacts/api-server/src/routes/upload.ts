import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
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

/** Normalise a time string to HH:MM (24-hour, zero-padded).
 *
 * Handles the full range of formats that appear when spreadsheets
 * are exported from Excel, Google Sheets, or typed manually:
 *
 *   "19:22"          → "19:22"   (24h HH:MM — passthrough)
 *   "19:22:30"       → "19:22"   (24h HH:MM:SS — strip seconds)
 *   "7:22 PM"        → "19:22"   (12h with minutes)
 *   "7 PM"           → "19:00"   (12h bare hour)
 *   "7:22:30 PM"     → "19:22"   (12h with seconds)
 *   0.80694...       → "19:22"   (Excel serial fraction of a day)
 *   "19"             → "19:00"   (bare integer hour)
 */
function normaliseTime(raw: string): string {
  const s = raw.trim();
  if (!s) return "";

  // ── 12-hour format (optional minutes, optional seconds, required AM/PM) ──
  const h12 = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)$/i);
  if (h12) {
    let h = parseInt(h12[1], 10);
    const m = h12[2] ?? "00";
    const period = h12[3].toUpperCase();
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${m}`;
  }

  // ── Excel time serial (decimal fraction of a full day, 0 < x < 1) ────────
  // e.g. 19:22 = (19*60 + 22) / (24*60) ≈ 0.80694
  const decimal = parseFloat(s);
  if (!isNaN(decimal) && !s.includes(":") && decimal > 0 && decimal < 1) {
    const totalMins = Math.round(decimal * 24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // ── Colon-separated (24h with optional seconds) ───────────────────────────
  const parts = s.split(":");
  if (parts.length >= 3) {
    // HH:MM:SS → HH:MM
    return `${parts[0].padStart(2, "0")}:${parts[1]}`;
  }
  if (parts.length === 2) {
    // HH:MM → HH:MM (zero-pad the hour)
    return `${parts[0].padStart(2, "0")}:${parts[1]}`;
  }

  // ── Bare integer hour ─────────────────────────────────────────────────────
  if (/^\d{1,2}$/.test(s)) {
    return `${s.padStart(2, "0")}:00`;
  }

  // ── Unrecognised — return trimmed as-is so callers can log it ────────────
  return s;
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
        const found = await db
          .select({ id: racecardsTable.id })
          .from(racecardsTable)
          .where(and(
            eq(racecardsTable.venue, venue),
            eq(racecardsTable.raceTime, time),
          ))
          .orderBy(desc(racecardsTable.raceDate))
          .limit(1);

        let racecardId: number;
        if (found.length > 0) {
          racecardId = found[0].id;
        } else {
          // Auto-create a stub racecard so non-runners aren't lost
          const today = new Date().toISOString().slice(0, 10);
          const [created] = await db.insert(racecardsTable).values({
            venue,
            raceDate:  today,
            raceTime:  time,
            raceName:  `${venue} ${time}`,
            distance:  "",
            going:     "",
            raceClass: "",
          }).returning();
          racecardId = created.id;
        }

        // If the runner already exists, mark them as a non-runner
        const [existing] = await db
          .select({ id: runnersTable.id })
          .from(runnersTable)
          .where(and(
            eq(runnersTable.racecardId, racecardId),
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
            racecardId,
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
          // ── 1. Exact match: venue + date + time ──────────────────────────
          const exactMatch = await db
            .select({ id: racecardsTable.id })
            .from(racecardsTable)
            .where(and(
              eq(racecardsTable.raceDate, date),
              eq(racecardsTable.venue, venue),
              eq(racecardsTable.raceTime, time),
            ))
            .limit(1);

          if (exactMatch.length > 0) {
            racecardId = exactMatch[0].id;
            // Refresh metadata so re-uploads propagate going/distance/name changes.
            await db.update(racecardsTable).set({
              raceName, distance, going, raceClass,
              ...(prize      ? { prize }      : {}),
              ...(nonRunners ? { nonRunners } : {}),
            }).where(eq(racecardsTable.id, racecardId));
          } else {
            // ── 2. Fuzzy match: same venue + date, any time ───────────────
            // If a horse from this group already exists in another racecard
            // at the same venue/date, the race time has been corrected in the
            // source data.  Update the existing racecard's time rather than
            // creating a duplicate.
            const horseNames = entry.rows
              .map(r => col(r, "horse_name"))
              .filter(Boolean);

            let fuzzyId: number | null = null;
            if (horseNames.length > 0) {
              const sameDayRacecards = await db
                .select({ id: racecardsTable.id })
                .from(racecardsTable)
                .where(and(
                  eq(racecardsTable.raceDate, date),
                  eq(racecardsTable.venue, venue),
                ));

              for (const candidate of sameDayRacecards) {
                const overlap = await db
                  .select({ id: runnersTable.id })
                  .from(runnersTable)
                  .where(and(
                    eq(runnersTable.racecardId, candidate.id),
                    inArray(runnersTable.horseName, horseNames),
                  ))
                  .limit(1);

                if (overlap.length > 0) {
                  fuzzyId = candidate.id;
                  break;
                }
              }
            }

            if (fuzzyId !== null) {
              // Same race, corrected time — update the existing racecard.
              racecardId = fuzzyId;
              await db.update(racecardsTable).set({
                raceTime: time, raceName, distance, going, raceClass,
                ...(prize      ? { prize }      : {}),
                ...(nonRunners ? { nonRunners } : {}),
              }).where(eq(racecardsTable.id, racecardId));
            } else {
              // ── 3. Genuinely new race ───────────────────────────────────
              const [inserted] = await db.insert(racecardsTable).values({
                venue, raceDate: date, raceTime: time,
                raceName, distance, going, raceClass,
                prize:      prize      || undefined,
                nonRunners: nonRunners || undefined,
              }).returning();
              racecardId = inserted.id;
              racesInserted++;
            }
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

    // Upsert runners — update existing rows rather than inserting duplicates.
    for (const [, entry] of raceMap) {
      if (!entry.racecardId) continue;
      for (const row of entry.rows) {
        const horseName = col(row, "horse_name");
        if (!horseName) continue;
        try {
          const [existing] = await db
            .select({ id: runnersTable.id })
            .from(runnersTable)
            .where(and(
              eq(runnersTable.racecardId, entry.racecardId),
              eq(runnersTable.horseName, horseName),
            ))
            .limit(1);

          if (existing) {
            await db.update(runnersTable).set({
              jockey:      col(row, "jockey")  || "",
              trainer:     col(row, "trainer") || "",
              weight:      col(row, "weight")  || "",
              draw:        col(row, "draw") ? parseInt(col(row, "draw"), 10) : null,
              age:         col(row, "age")  || null,
              form:        col(row, "form") || null,
              odds:        col(row, "odds") || null,
              isNonRunner: false,
              scratched:   false,
            }).where(eq(runnersTable.id, existing.id));
          } else {
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
          }
        } catch (err) {
          errors.push(`Failed to upsert runner ${horseName}: ${String(err)}`);
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
