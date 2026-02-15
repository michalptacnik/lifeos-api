import { PrismaClient, TaskArea, TaskStatus } from "@prisma/client";
import { Router } from "express";
import { automationPlanSchema, ensureContext, trimToNull } from "../domain.js";

export function createAutomationRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/activity", async (req, res) => {
    try {
      const { householdId } = await ensureContext(prisma, req);
      const logs = await prisma.auditLog.findMany({
        where: {
          entityType: "automation"
        },
        orderBy: { createdAt: "desc" },
        take: 100
      });

      res.json(
        logs
          .filter((log) => {
            const payload = log.payload as Record<string, unknown> | null;
            return payload?.householdId === householdId;
          })
          .slice(0, 20)
          .map((log) => ({
            id: log.id,
            action: log.action,
            payload: log.payload,
            createdAt: log.createdAt
          }))
      );
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  router.post("/plan-day", async (req, res) => {
    try {
      const payload = automationPlanSchema.parse(req.body ?? {});
      const { householdId, user } = await ensureContext(prisma, req);
      const projectFilter = trimToNull(payload.project);

      const candidates = await prisma.task.findMany({
        where: {
          householdId,
          area: payload.area,
          project: projectFilter ?? undefined,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROCESS] }
        },
        include: { owner: { select: { email: true } } },
        orderBy: [{ createdAt: "asc" }],
        take: 60
      });

      const scored = candidates
        .map((task) => {
          let score = 0;
          if (task.status === TaskStatus.IN_PROCESS) score += 100;
          if (task.startedOn) score += 25;
          const ageDays = Math.floor((Date.now() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24));
          score += Math.min(40, Math.max(0, ageDays));
          const reason = task.status === TaskStatus.IN_PROCESS ? "already in progress" : "oldest pending in selected scope";
          return { task, score, reason };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, payload.limit);

      const plan = scored.map(({ task, reason }) => ({
        id: task.id,
        title: task.title,
        area: task.area,
        project: task.project,
        status: task.status,
        ownerEmail: task.owner?.email ?? null,
        reason
      }));

      const firstTodo = scored.find((item) => item.task.status === TaskStatus.TODO)?.task ?? null;
      const proposedChanges = firstTodo
        ? [
            {
              type: "task_status_update",
              taskId: firstTodo.id,
              title: firstTodo.title,
              before: { status: firstTodo.status, startedOn: firstTodo.startedOn },
              after: { status: TaskStatus.IN_PROCESS, startedOn: firstTodo.startedOn ?? new Date() },
              reason: "promote highest-priority TODO for today plan"
            }
          ]
        : [];
      const summary = firstTodo
        ? `Will promote "${firstTodo.title}" from TODO to IN_PROCESS.`
        : "No TODO task needs status change; plan is informational only.";

      if (payload.mode === "dry_run") {
        res.json({
          mode: "dry_run",
          selected: plan,
          summary,
          changes: proposedChanges,
          applied: null
        });
        return;
      }

      if ((payload.area ?? TaskArea.WORK) === TaskArea.BUDGET && !payload.confirmBudgetApply) {
        res.status(403).json({
          message: "Budget apply requires explicit confirmation.",
          approvalRequired: true,
          requiredConfirmationField: "confirmBudgetApply",
          mode: "apply_blocked",
          selected: plan,
          summary,
          changes: proposedChanges
        });
        return;
      }

      let promotedTaskId: string | null = null;

      await prisma.$transaction(async (tx) => {
        if (firstTodo) {
          await tx.task.update({
            where: { id: firstTodo.id },
            data: {
              status: TaskStatus.IN_PROCESS,
              startedOn: firstTodo.startedOn ?? new Date()
            }
          });
          promotedTaskId = firstTodo.id;
        }

        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: "automation.plan_day.apply",
            entityType: "automation",
            entityId: `plan-day:${new Date().toISOString()}`,
            payload: {
              householdId,
              area: payload.area ?? null,
              project: projectFilter ?? null,
              limit: payload.limit,
              selectedTaskIds: plan.map((item) => item.id),
              promotedTaskId
            }
          }
        });
      });

      res.json({
        mode: "apply",
        selected: plan,
        summary,
        changes: proposedChanges,
        applied: {
          promotedTaskId
        }
      });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  return router;
}
