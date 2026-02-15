import { PrismaClient, TaskStatus } from "@prisma/client";
import { Router } from "express";
import { ensureContext, mapTask, workStartSchema, workStopSchema, workUpdateSchema } from "../domain.js";

export function createWorktimeRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const { householdId, user } = await ensureContext(prisma, req);

      const [queueTasks, activeSession, recentSessions] = await Promise.all([
        prisma.task.findMany({
          where: { householdId, status: { in: [TaskStatus.TODO, TaskStatus.IN_PROCESS] } },
          include: { owner: { select: { email: true } } },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }]
        }),
        prisma.workSession.findFirst({
          where: { userId: user.id, endedAt: null },
          include: { task: { include: { owner: { select: { email: true } } } } },
          orderBy: { startedAt: "desc" }
        }),
        prisma.workSession.findMany({
          where: { userId: user.id },
          include: { task: { include: { owner: { select: { email: true } } } } },
          orderBy: { startedAt: "desc" },
          take: 20
        })
      ]);

      res.json({
        queueTasks: queueTasks.map(mapTask),
        activeSession: activeSession
          ? {
              id: activeSession.id,
              task: mapTask(activeSession.task),
              startedAt: activeSession.startedAt,
              endedAt: activeSession.endedAt,
              notes: activeSession.notes
            }
          : null,
        recentSessions: recentSessions.map((session) => ({
          id: session.id,
          task: mapTask(session.task),
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          notes: session.notes
        }))
      });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  router.post("/start", async (req, res) => {
    try {
      const payload = workStartSchema.parse(req.body);
      const { householdId, user } = await ensureContext(prisma, req);

      const task = await prisma.task.findFirst({
        where: { id: payload.taskId, householdId }
      });

      if (!task) {
        res.status(404).json({ message: "Task not found" });
        return;
      }

      const active = await prisma.workSession.findFirst({
        where: { userId: user.id, endedAt: null }
      });

      if (active) {
        res.status(409).json({ message: "Stop current work session first" });
        return;
      }

      if (task.status === TaskStatus.TODO) {
        await prisma.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.IN_PROCESS, startedOn: task.startedOn ?? new Date() }
        });
      }

      const session = await prisma.workSession.create({
        data: {
          userId: user.id,
          taskId: task.id,
          startedAt: new Date()
        },
        include: { task: { include: { owner: { select: { email: true } } } } }
      });

      res.status(201).json({
        id: session.id,
        task: mapTask(session.task),
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        notes: session.notes
      });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  router.post("/stop", async (req, res) => {
    try {
      const payload = workStopSchema.parse(req.body ?? {});
      const { user } = await ensureContext(prisma, req);

      const active = payload.sessionId
        ? await prisma.workSession.findFirst({ where: { id: payload.sessionId, userId: user.id, endedAt: null } })
        : await prisma.workSession.findFirst({ where: { userId: user.id, endedAt: null }, orderBy: { startedAt: "desc" } });

      if (!active) {
        res.status(404).json({ message: "Active session not found" });
        return;
      }

      const stopped = await prisma.workSession.update({
        where: { id: active.id },
        data: { endedAt: new Date() },
        include: { task: { include: { owner: { select: { email: true } } } } }
      });

      res.json({
        id: stopped.id,
        task: mapTask(stopped.task),
        startedAt: stopped.startedAt,
        endedAt: stopped.endedAt,
        notes: stopped.notes
      });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  router.patch("/:id", async (req, res) => {
    try {
      const payload = workUpdateSchema.parse(req.body);
      const { user } = await ensureContext(prisma, req);

      const updated = await prisma.workSession.updateMany({
        where: { id: req.params.id, userId: user.id },
        data: { notes: payload.notes }
      });

      if (!updated.count) {
        res.status(404).json({ message: "Session not found" });
        return;
      }

      const session = await prisma.workSession.findUnique({
        where: { id: req.params.id },
        include: { task: { include: { owner: { select: { email: true } } } } }
      });

      res.json({
        id: session!.id,
        task: mapTask(session!.task),
        startedAt: session!.startedAt,
        endedAt: session!.endedAt,
        notes: session!.notes
      });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  return router;
}
