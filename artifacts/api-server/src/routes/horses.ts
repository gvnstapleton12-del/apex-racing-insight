import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, horsesTable } from "@workspace/db";
import {
  ListHorsesQueryParams,
  CreateHorseBody,
  GetHorseParams,
  UpdateHorseParams,
  UpdateHorseBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/horses/find-or-create", async (req, res): Promise<void> => {
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const trimmed = name.trim();
  const [existing] = await db.select().from(horsesTable).where(eq(horsesTable.name, trimmed)).limit(1);
  if (existing) { res.json(existing); return; }
  const [created] = await db.insert(horsesTable).values({ name: trimmed }).returning();
  res.status(201).json(created);
});

router.get("/horses", async (req, res): Promise<void> => {
  const params = ListHorsesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const horses = params.data.search
    ? await db.select().from(horsesTable).where(ilike(horsesTable.name, `%${params.data.search}%`)).orderBy(horsesTable.name)
    : await db.select().from(horsesTable).orderBy(horsesTable.name);

  res.json(horses);
});

router.post("/horses", async (req, res): Promise<void> => {
  const parsed = CreateHorseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [horse] = await db.insert(horsesTable).values(parsed.data).returning();
  res.status(201).json(horse);
});

router.get("/horses/:id", async (req, res): Promise<void> => {
  const params = GetHorseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [horse] = await db.select().from(horsesTable).where(eq(horsesTable.id, params.data.id));
  if (!horse) {
    res.status(404).json({ error: "Horse not found" });
    return;
  }

  res.json(horse);
});

router.patch("/horses/:id", async (req, res): Promise<void> => {
  const params = UpdateHorseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateHorseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [horse] = await db.update(horsesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(horsesTable.id, params.data.id)).returning();
  if (!horse) {
    res.status(404).json({ error: "Horse not found" });
    return;
  }

  res.json(horse);
});

export default router;
