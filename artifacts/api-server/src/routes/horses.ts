import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, horsesTable } from "@workspace/db";
import {
  ListHorsesQueryParams,
  CreateHorseBody,
  GetHorseParams,
  GetHorseResponse,
  UpdateHorseParams,
  UpdateHorseBody,
  UpdateHorseResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

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
  res.status(201).json(GetHorseResponse.parse(horse));
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

  res.json(GetHorseResponse.parse(horse));
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

  res.json(UpdateHorseResponse.parse(horse));
});

export default router;
