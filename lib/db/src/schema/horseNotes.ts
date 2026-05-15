import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const horseNotesTable = pgTable("horse_notes", {
  id: serial("id").primaryKey(),
  horseId: integer("horse_id").notNull(),
  noteType: text("note_type").notNull(),
  content: text("content").notNull(),
  raceRef: text("race_ref"),
  venue: text("venue"),
  date: text("date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHorseNoteSchema = createInsertSchema(horseNotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHorseNote = z.infer<typeof insertHorseNoteSchema>;
export type HorseNote = typeof horseNotesTable.$inferSelect;
