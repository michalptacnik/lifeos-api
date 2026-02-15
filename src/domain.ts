import { PrismaClient, Role, TaskArea, TaskStatus } from "@prisma/client";
import type { Request } from "express";
import { z } from "zod";

export const actorHeader = "x-user-email";

export const taskCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  area: z.nativeEnum(TaskArea).optional(),
  project: z.string().optional().nullable(),
  ownerEmail: z.string().email().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  startedOn: z.string().datetime().optional().nullable(),
  finishedOn: z.string().datetime().optional().nullable()
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  area: z.nativeEnum(TaskArea).optional(),
  project: z.string().optional().nullable(),
  ownerEmail: z.string().email().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
  startedOn: z.string().datetime().optional().nullable(),
  finishedOn: z.string().datetime().optional().nullable()
});

export const workStartSchema = z.object({
  taskId: z.string().min(1)
});

export const workStopSchema = z.object({
  sessionId: z.string().optional()
});

export const workUpdateSchema = z.object({
  notes: z.string().max(5000)
});

export const automationPlanSchema = z.object({
  mode: z.enum(["dry_run", "apply"]).default("dry_run"),
  area: z.nativeEnum(TaskArea).optional(),
  project: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(5),
  confirmBudgetApply: z.boolean().optional().default(false)
});

export function parseNullableDate(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(value);
}

function parseAreaFromLegacyProject(project?: string | null): TaskArea | undefined {
  if (!project) return undefined;
  const prefix = project.split("::")[0];
  if (prefix === "HOME" || prefix === "BUDGET" || prefix === "WORK") {
    return prefix;
  }
  return undefined;
}

function stripLegacyAreaPrefix(project?: string | null): string | null | undefined {
  if (project === undefined) return undefined;
  if (project === null) return null;

  const parsedArea = parseAreaFromLegacyProject(project);
  if (!parsedArea) {
    const trimmed = project.trim();
    return trimmed ? trimmed : null;
  }

  const name = project.slice(`${parsedArea}::`.length).trim();
  return name ? name : null;
}

export function normalizeAreaAndProject(input: { area?: TaskArea; project?: string | null; fallbackArea?: TaskArea }) {
  const fromProject = parseAreaFromLegacyProject(input.project);
  const area = input.area ?? fromProject ?? input.fallbackArea ?? TaskArea.WORK;
  const project = stripLegacyAreaPrefix(input.project);
  return { area, project };
}

function requireActorEmail(req: Request): string {
  const raw = req.header(actorHeader)?.trim().toLowerCase();
  if (!raw) {
    throw new Error(`Missing required header: ${actorHeader}`);
  }
  return raw;
}

async function upsertUserByEmail(prisma: PrismaClient, email: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      displayName: email.split("@")[0]
    }
  });
}

async function ensureHouseholdForUser(prisma: PrismaClient, userId: string, email: string) {
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

export async function ensureContext(prisma: PrismaClient, req: Request) {
  const email = requireActorEmail(req);
  const user = await upsertUserByEmail(prisma, email);
  const householdId = await ensureHouseholdForUser(prisma, user.id, email);
  return { email, user, householdId };
}

export async function resolveTaskOwner(prisma: PrismaClient, householdId: string, ownerEmail?: string | null) {
  if (!ownerEmail) {
    return null;
  }

  const normalizedEmail = ownerEmail.toLowerCase();
  const owner = await upsertUserByEmail(prisma, normalizedEmail);

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

export function mapTask(task: {
  id: string;
  title: string;
  description: string | null;
  area: TaskArea;
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
    area: task.area,
    project: task.project,
    status: task.status,
    startedOn: task.startedOn,
    finishedOn: task.finishedOn,
    createdAt: task.createdAt,
    ownerEmail: task.owner?.email ?? null
  };
}

export function trimToNull(value?: string) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
