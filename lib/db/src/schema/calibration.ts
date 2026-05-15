import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const calibrationEntriesTable = pgTable("calibration_entries", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  racecardId: integer("racecard_id").notNull(),
  runnerId: integer("runner_id"),
  predictedClass: text("predicted_class").notNull(),
  outcome: text("outcome").notNull(),
  apexScore: real("apex_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCalibrationEntrySchema = createInsertSchema(calibrationEntriesTable).omit({ id: true, createdAt: true });
export type InsertCalibrationEntry = z.infer<typeof insertCalibrationEntrySchema>;
export type CalibrationEntry = typeof calibrationEntriesTable.$inferSelect;
