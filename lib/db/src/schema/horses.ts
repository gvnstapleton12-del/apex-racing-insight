import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const horsesTable = pgTable("horses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  trainer: text("trainer"),
  owner: text("owner"),
  age: integer("age"),
  sex: text("sex"),
  colour: text("colour"),
  sire: text("sire"),
  dam: text("dam"),
  preferredGoing: text("preferred_going"),
  preferredDistance: text("preferred_distance"),
  trackSpecialistNotes: text("track_specialist_notes"),
  behaviourProfile: text("behaviour_profile"),
  memoryNotes: text("memory_notes"),
  replayNotes: text("replay_notes"),
  hiddenValueFlags: text("hidden_value_flags"),
  volatilityRating: text("volatility_rating"),
  totalRuns: integer("total_runs"),
  wins: integer("wins"),
  places: integer("places"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHorseSchema = createInsertSchema(horsesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHorse = z.infer<typeof insertHorseSchema>;
export type Horse = typeof horsesTable.$inferSelect;
