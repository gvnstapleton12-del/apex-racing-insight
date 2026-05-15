import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, horseNotesTable } from "@workspace/db";
import {
  ListHorseNotesParams,
  CreateHorseNoteParams,
  CreateHorseNoteBody,
  UpdateNoteParams,
  UpdateNoteBody,
  UpdateNoteResponse,
  DeleteNoteParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/horses/:id/notes", async (req, res): Promise<void> => {
  const params = ListHorseNotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const notes = await db.select().from(horseNotesTable).where(eq(horseNotesTable.horseId, params.data.id)).orderBy(horseNotesTable.createdAt);
  res.json(notes);
});

router.post("/horses/:id/notes", async (req, res): Promise<void> => {
  const params = CreateHorseNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateHorseNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db.insert(horseNotesTable).values({ ...parsed.data, horseId: params.data.id }).returning();
  res.status(201).json(note);
});

router.patch("/notes/:id", async (req, res): Promise<void> => {
  const params = UpdateNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [note] = await db.update(horseNotesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(horseNotesTable.id, params.data.id)).returning();
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  res.json(UpdateNoteResponse.parse(note));
});

router.delete("/notes/:id", async (req, res): Promise<void> => {
  const params = DeleteNoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(horseNotesTable).where(eq(horseNotesTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
