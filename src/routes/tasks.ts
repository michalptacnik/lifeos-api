import { PrismaClient, TaskStatus } from "@prisma/client";
import { Router } from "express";
import {
  ensureContext,
  mapTask,
  normalizeAreaAndProject,
  parseNullableDate,
  resolveTaskOwner,
  taskCreateSchema,
  taskUpdateSchema
} from "../domain.js";

export function createTasksRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const { householdId } = await ensureContext(prisma, req);
      const tasks = await prisma.task.findMany({
        where: { householdId },
        include: { owner: { select: { email: true } } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }]
      });
      res.json(tasks.map(mapTask));
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const payload = taskCreateSchema.parse(req.body);
      const { householdId, user } = await ensureContext(prisma, req);
      const owner = await resolveTaskOwner(prisma, householdId, payload.ownerEmail ?? user.email);
      const normalized = normalizeAreaAndProject({ area: payload.area, project: payload.project });

      const task = await prisma.task.create({
        data: {
          householdId,
          ownerUserId: owner?.id ?? user.id,
          title: payload.title,
          description: payload.description ?? null,
          area: normalized.area,
          project: normalized.project ?? null,
          status: payload.status ?? TaskStatus.TODO,
          startedOn: parseNullableDate(payload.startedOn),
          finishedOn: parseNullableDate(payload.finishedOn)
        },
        include: { owner: { select: { email: true } } }
      });

      res.status(201).json(mapTask(task));
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      const payload = taskUpdateSchema.parse(req.body);
      const { householdId } = await ensureContext(prisma, req);
      const existing = await prisma.task.findFirst({
        where: { id: req.params.id, householdId }
      });

      if (!existing) {
        res.status(404).json({ message: "Task not found" });
        return;
      }

      const owner = await resolveTaskOwner(prisma, householdId, payload.ownerEmail);
      const nextStatus = payload.status ?? existing.status;
      const normalized = normalizeAreaAndProject({
        area: payload.area ?? existing.area,
        project: payload.project === undefined ? existing.project : payload.project,
        fallbackArea: existing.area
      });

      const updateData: Record<string, unknown> = {
        title: payload.title ?? existing.title,
        description: payload.description === undefined ? existing.description : payload.description,
        area: normalized.area,
        project: normalized.project,
        ownerUserId: owner ? owner.id : existing.ownerUserId,
        status: nextStatus,
        startedOn: payload.startedOn === undefined ? existing.startedOn : parseNullableDate(payload.startedOn),
        finishedOn: payload.finishedOn === undefined ? existing.finishedOn : parseNullableDate(payload.finishedOn)
      };

      if (payload.status && payload.status !== existing.status) {
        if (payload.status === TaskStatus.IN_PROCESS && !existing.startedOn) {
          updateData.startedOn = new Date();
        }

        if (payload.status === TaskStatus.DONE) {
          updateData.finishedOn = new Date();
          updateData.completedAt = new Date();
        }

        if (payload.status !== TaskStatus.DONE && existing.finishedOn && payload.finishedOn === undefined) {
          updateData.finishedOn = null;
        }
      }

      const task = await prisma.task.update({
        where: { id: req.params.id },
        data: updateData,
        include: { owner: { select: { email: true } } }
      });

      res.json(mapTask(task));
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const { householdId } = await ensureContext(prisma, req);
      const deleted = await prisma.task.deleteMany({
        where: { id: req.params.id, householdId }
      });

      if (!deleted.count) {
        res.status(404).json({ message: "Task not found" });
        return;
      }

      res.status(204).send();
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  return router;
}
