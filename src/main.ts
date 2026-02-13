import "dotenv/config";
import cors from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import { PrismaClient, Role, TaskStatus } from "@prisma/client";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";

const prisma = new PrismaClient();
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const actorHeader = "x-user-email";
const internalHeader = "x-internal-api-key";
const expectedInternalKey = process.env.INTERNAL_API_KEY;

const taskCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  project: z.string().optional().nullable(),
  ownerEmail: z.string().email().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  startedOn: z.string().datetime().optional().nullable(),
  finishedOn: z.string().datetime().optional().nullable()
});

const taskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  project: z.string().optional().nullable(),
  ownerEmail: z.string().email().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  startedOn: z.string().datetime().optional().nullable(),
  finishedOn: z.string().datetime().optional().nullable()
});

const workStartSchema = z.object({
  taskId: z.string().min(1)
});

const workStopSchema = z.object({
  sessionId: z.string().optional()
});

const workUpdateSchema = z.object({
  notes: z.string().max(5000)
});

function parseNullableDate(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(value);
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

app.use((req, res, next) => {
  if (req.path === "/health") {
    next();
    return;
  }

  if (!expectedInternalKey) {
    res.status(500).json({ message: "Server misconfigured: INTERNAL_API_KEY missing" });
    return;
  }

  const received = req.header(internalHeader);
  if (!received || !safeEqual(received, expectedInternalKey)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  next();
});

function requireActorEmail(req: Request): string {
  const raw = req.header(actorHeader)?.trim().toLowerCase();
  if (!raw) {
    throw new Error(`Missing required header: ${actorHeader}`);
  }
  return raw;
}

async function upsertUserByEmail(email: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      displayName: email.split("@")[0]
    }
  });
}

async function ensureHouseholdForUser(userId: string, email: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    include: { household: true }
  });

  if (membership) {
    return membership.householdId;
  }

  const household = await prisma.household.create({
    data: {
      name: `${email} household`,
      memberships: {
        create: {
          userId,
          role: Role.OWNER
        }
      }
    }
  });

  return household.id;
}

async function ensureContext(req: Request) {
  const email = requireActorEmail(req);
  const user = await upsertUserByEmail(email);
  const householdId = await ensureHouseholdForUser(user.id, email);
  return { email, user, householdId };
}

async function resolveTaskOwner(householdId: string, ownerEmail?: string | null) {
  if (!ownerEmail) {
    return null;
  }

  const normalizedEmail = ownerEmail.toLowerCase();
  const owner = await upsertUserByEmail(normalizedEmail);

  await prisma.membership.upsert({
    where: {
      userId_householdId: {
        userId: owner.id,
        householdId
      }
    },
    update: {},
    create: {
      userId: owner.id,
      householdId,
      role: Role.VIEWER
    }
  });

  return owner;
}

function mapTask(task: {
  id: string;
  title: string;
  description: string | null;
  project: string | null;
  status: TaskStatus;
  startedOn: Date | null;
  finishedOn: Date | null;
  createdAt: Date;
  owner: { email: string } | null;
}) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    project: task.project,
    status: task.status,
    startedOn: task.startedOn,
    finishedOn: task.finishedOn,
    createdAt: task.createdAt,
    ownerEmail: task.owner?.email ?? null
  };
}

function toIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "lifeos-api" });
});

app.get("/dashboard", (_req, res) => {
  res.json({
    message: "Dashboard aggregate endpoint placeholder",
    modules: ["tasks", "budgets", "inventory", "obligations"]
  });
});

app.get("/tasks", async (req, res) => {
  try {
    const { householdId } = await ensureContext(req);
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

app.post("/tasks", async (req, res) => {
  try {
    const payload = taskCreateSchema.parse(req.body);
    const { householdId, user } = await ensureContext(req);
    const owner = await resolveTaskOwner(householdId, payload.ownerEmail ?? user.email);

    const task = await prisma.task.create({
      data: {
        householdId,
        ownerUserId: owner?.id ?? user.id,
        title: payload.title,
        description: payload.description ?? null,
        project: payload.project ?? null,
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

app.patch("/tasks/:id", async (req, res) => {
  try {
    const payload = taskUpdateSchema.parse(req.body);
    const { householdId } = await ensureContext(req);
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, householdId }
    });

    if (!existing) {
      res.status(404).json({ message: "Task not found" });
      return;
    }

    const owner = await resolveTaskOwner(householdId, payload.ownerEmail);
    const nextStatus = payload.status ?? existing.status;

    const updateData: Record<string, unknown> = {
      title: payload.title ?? existing.title,
      description: payload.description === undefined ? existing.description : payload.description,
      project: payload.project === undefined ? existing.project : payload.project,
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

app.delete("/tasks/:id", async (req, res) => {
  try {
    const { householdId } = await ensureContext(req);
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

app.get("/worktime", async (req, res) => {
  try {
    const { householdId, user } = await ensureContext(req);

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

app.post("/worktime/start", async (req, res) => {
  try {
    const payload = workStartSchema.parse(req.body);
    const { householdId, user } = await ensureContext(req);

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

app.post("/worktime/stop", async (req, res) => {
  try {
    const payload = workStopSchema.parse(req.body ?? {});
    const { user } = await ensureContext(req);

    const active = payload.sessionId
      ? await prisma.workSession.findFirst({ where: { id: payload.sessionId, userId: user.id } })
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

app.patch("/worktime/:id", async (req, res) => {
  try {
    const payload = workUpdateSchema.parse(req.body);
    const { user } = await ensureContext(req);

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

app.get("/calendar/tasks.ics", async (req, res) => {
  try {
    const { householdId } = await ensureContext(req);
    const tasks = await prisma.task.findMany({
      where: { householdId },
      include: { owner: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      take: 300
    });

    const now = new Date();
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//LifeOS//Tasks//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];

    for (const task of tasks) {
      const start = task.startedOn ?? task.createdAt;
      const end = task.finishedOn ?? new Date(start.getTime() + 60 * 60 * 1000);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${task.id}@lifeos`);
      lines.push(`DTSTAMP:${toIcsDate(now)}`);
      lines.push(`DTSTART:${toIcsDate(start)}`);
      lines.push(`DTEND:${toIcsDate(end)}`);
      lines.push(`SUMMARY:${task.title.replace(/,/g, "\\,")}`);
      const desc = [
        `Status: ${task.status}`,
        task.project ? `Project: ${task.project}` : "",
        task.owner?.email ? `Owner: ${task.owner.email}` : "",
        task.description ? `Notes: ${task.description}` : ""
      ]
        .filter(Boolean)
        .join(" | ")
        .replace(/,/g, "\\,");
      lines.push(`DESCRIPTION:${desc}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.send(lines.join("\r\n"));
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.get("/budgets", (_req, res) => res.status(501).json({ message: "Not implemented" }));
app.post("/budgets", (_req, res) => res.status(501).json({ message: "Not implemented" }));
app.get("/inventory", (_req, res) => res.status(501).json({ message: "Not implemented" }));
app.post("/inventory", (_req, res) => res.status(501).json({ message: "Not implemented" }));
app.get("/obligations", (_req, res) => res.status(501).json({ message: "Not implemented" }));
app.post("/obligations", (_req, res) => res.status(501).json({ message: "Not implemented" }));

app.use((err: Error, _req: Request, res: Response, _next: () => void) => {
  res.status(500).json({ message: err.message });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`LifeOS API listening on :${port}`);
});
