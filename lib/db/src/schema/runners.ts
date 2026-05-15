import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const runnersTable = pgTable("runners", {
  id: serial("id").primaryKey(),
  racecardId: integer("racecard_id").notNull(),
  horseId: integer("horse_id"),
  horseName: text("horse_name").notNull(),
  jockey: text("jockey").notNull(),
  trainer: text("trainer").notNull(),
  draw: integer("draw"),
  weight: text("weight").notNull(),
  age: text("age"),
  form: text("form"),
  odds: text("odds"),
  isNonRunner: boolean("is_non_runner").notNull().default(false),
  scratched: boolean("scratched").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRunnerSchema = createInsertSchema(runnersTable).omit({ id: true, createdAt: true });
export type InsertRunner = z.infer<typeof insertRunnerSchema>;
export type Runner = typeof runnersTable.$inferSelect;
