import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const racecardsTable = pgTable("racecards", {
  id: serial("id").primaryKey(),
  venue: text("venue").notNull(),
  raceDate: text("race_date").notNull(),
  raceTime: text("race_time").notNull(),
  raceName: text("race_name").notNull(),
  distance: text("distance").notNull(),
  going: text("going").notNull(),
  raceClass: text("race_class").notNull(),
  prize: text("prize"),
  trackProfile: text("track_profile"),
  marketContext: text("market_context"),
  trainerComments: text("trainer_comments"),
  nonRunners: text("non_runners"),
  calibrationNote: text("calibration_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRacecardSchema = createInsertSchema(racecardsTable).omit({ id: true, createdAt: true });
export type InsertRacecard = z.infer<typeof insertRacecardSchema>;
export type Racecard = typeof racecardsTable.$inferSelect;
