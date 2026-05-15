import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const apexScoresTable = pgTable("apex_scores", {
  id: serial("id").primaryKey(),
  runnerId: integer("runner_id").notNull(),
  racecardId: integer("racecard_id").notNull(),
  abilityScore: real("ability_score").notNull().default(0),
  paceFitScore: real("pace_fit_score").notNull().default(0),
  tacticalResilienceScore: real("tactical_resilience_score").notNull().default(0),
  groundTripScore: real("ground_trip_score").notNull().default(0),
  replayIntelligenceScore: real("replay_intelligence_score").notNull().default(0),
  hiddenValueScore: real("hidden_value_score").notNull().default(0),
  volatilityRisk: real("volatility_risk").notNull().default(0),
  totalScore: real("total_score").notNull().default(0),
  confidenceClass: text("confidence_class").notNull().default("no_bet"),
  analystNotes: text("analyst_notes"),
  replayContext: text("replay_context"),
  contextualIntelligence: text("contextual_intelligence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertApexScoreSchema = createInsertSchema(apexScoresTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertApexScore = z.infer<typeof insertApexScoreSchema>;
export type ApexScore = typeof apexScoresTable.$inferSelect;
