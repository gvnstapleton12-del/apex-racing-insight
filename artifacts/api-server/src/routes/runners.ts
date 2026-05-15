import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, runnersTable } from "@workspace/db";
import {
  CreateRunnerBody,
  GetRunnerParams,
  GetRunnerResponse,
  UpdateRunnerParams,
  UpdateRunnerBody,
  UpdateRunnerResponse,
  DeleteRunnerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/runners", async (req, res): Promise<void> => {
  const parsed = CreateRunnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [runner] = await db.insert(runnersTable).values(parsed.data).returning();
  res.status(201).json(GetRunnerResponse.parse(runner));
});

router.get("/runners/:id", async (req, res): Promise<void> => {
  const params = GetRunnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [runner] = await db.select().from(runnersTable).where(eq(runnersTable.id, params.data.id));
  if (!runner) {
    res.status(404).json({ error: "Runner not found" });
    return;
  }

  res.json(GetRunnerResponse.parse(runner));
});

router.patch("/runners/:id", async (req, res): Promise<void> => {
  const params = UpdateRunnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRunnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [runner] = await db.update(runnersTable).set(parsed.data).where(eq(runnersTable.id, params.data.id)).returning();
  if (!runner) {
    res.status(404).json({ error: "Runner not found" });
    return;
  }

  res.json(UpdateRunnerResponse.parse(runner));
});

router.delete("/runners/:id", async (req, res): Promise<void> => {
  const params = DeleteRunnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db.delete(runnersTable).where(eq(runnersTable.id, params.data.id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Runner not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
