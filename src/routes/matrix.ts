import { MatrixMembershipState, Prisma, PrismaClient, Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { ensureContext } from "../domain.js";

const bootstrapRoomSchema = z.object({
  externalRoomId: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(120),
  alias: z.string().trim().min(1).max(120).optional().nullable(),
  actorMatrixUserId: z.string().trim().min(1).max(255).optional().nullable(),
  actorDisplayName: z.string().trim().max(120).optional().nullable()
});

const syncMembershipSchema = z.object({
  members: z
    .array(
      z.object({
        email: z.string().email(),
        membership: z.nativeEnum(MatrixMembershipState),
        matrixUserId: z.string().trim().min(1).max(255).optional().nullable(),
        displayName: z.string().trim().max(120).optional().nullable()
      })
    )
    .min(1)
});

const relayHookSchema = z.object({
  externalEventId: z.string().trim().min(1).max(255),
  eventType: z.string().trim().min(1).max(120),
  senderMatrixUserId: z.string().trim().min(1).max(255).optional().nullable(),
  payload: z.record(z.any()).optional().nullable(),
  unreadByEmail: z
    .array(
      z.object({
        email: z.string().email(),
        unreadCount: z.number().int().min(0),
        notificationCount: z.number().int().min(0).optional().default(0)
      })
    )
    .optional()
    .default([])
});

function trimToNull(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function matrixLocalpart(email: string) {
  return email.trim().toLowerCase().replace(/[^a-z0-9._=-]/g, "_");
}

function mapRoom(room: {
  id: string;
  externalRoomId: string;
  alias: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  memberships?: Array<{
    membership: MatrixMembershipState;
    unreadCount: number;
    notificationCount: number;
    user: { email: string; matrixIdentity: { matrixUserId: string | null } | null };
  }>;
}) {
  return {
    id: room.id,
    externalRoomId: room.externalRoomId,
    alias: room.alias,
    name: room.name,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    memberships: (room.memberships ?? []).map((membership) => ({
      email: membership.user.email,
      matrixUserId: membership.user.matrixIdentity?.matrixUserId ?? null,
      membership: membership.membership,
      unreadCount: membership.unreadCount,
      notificationCount: membership.notificationCount
    }))
  };
}

async function ensureUserIdentity(
  prisma: PrismaClient,
  params: { userId: string; email: string; matrixUserId?: string | null; displayName?: string | null }
) {
  const matrixUserId = params.matrixUserId?.trim() || `@${matrixLocalpart(params.email)}:lifeos.local`;
  return prisma.matrixIdentity.upsert({
    where: { userId: params.userId },
    update: {
      matrixUserId,
      ...(params.displayName !== undefined ? { displayName: trimToNull(params.displayName) } : {})
    },
    create: {
      userId: params.userId,
      matrixUserId,
      displayName: trimToNull(params.displayName)
    }
  });
}

export function createMatrixRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/rooms", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const rooms = await prisma.matrixRoom.findMany({
      where: { householdId },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                email: true,
                matrixIdentity: { select: { matrixUserId: true } }
              }
            }
          }
        }
      },
      orderBy: [{ name: "asc" }]
    });

    res.json(rooms.map(mapRoom));
  });

  router.post("/rooms/bootstrap", async (req, res) => {
    const { householdId, user, email } = await ensureContext(prisma, req);
    const payload = bootstrapRoomSchema.parse(req.body ?? {});

    const room = await prisma.matrixRoom.upsert({
      where: {
        householdId_externalRoomId: {
          householdId,
          externalRoomId: payload.externalRoomId.trim()
        }
      },
      update: {
        name: payload.name.trim(),
        alias: trimToNull(payload.alias)
      },
      create: {
        householdId,
        externalRoomId: payload.externalRoomId.trim(),
        name: payload.name.trim(),
        alias: trimToNull(payload.alias)
      }
    });

    const identity = await ensureUserIdentity(prisma, {
      userId: user.id,
      email,
      matrixUserId: payload.actorMatrixUserId,
      displayName: payload.actorDisplayName
    });

    const actorMembership = await prisma.matrixRoomMembership.upsert({
      where: { roomId_userId: { roomId: room.id, userId: user.id } },
      update: { membership: MatrixMembershipState.JOINED },
      create: { roomId: room.id, userId: user.id, membership: MatrixMembershipState.JOINED }
    });

    res.status(201).json({
      room: mapRoom(room),
      actor: {
        email,
        matrixUserId: identity.matrixUserId,
        membership: actorMembership.membership
      }
    });
  });

  router.post("/rooms/:roomId/sync-membership", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const payload = syncMembershipSchema.parse(req.body ?? {});

    const room = await prisma.matrixRoom.findFirst({
      where: { id: req.params.roomId, householdId }
    });

    if (!room) {
      res.status(404).json({ message: "Matrix room not found" });
      return;
    }

    const synced = await prisma.$transaction(async (tx) => {
      const result: Array<{ email: string; membership: MatrixMembershipState; matrixUserId: string }> = [];

      for (const entry of payload.members) {
        const normalizedEmail = entry.email.trim().toLowerCase();
        const memberUser = await tx.user.upsert({
          where: { email: normalizedEmail },
          update: {},
          create: {
            email: normalizedEmail,
            displayName: normalizedEmail.split("@")[0]
          }
        });

        await tx.membership.upsert({
          where: {
            userId_householdId: {
              userId: memberUser.id,
              householdId
            }
          },
          update: {},
          create: {
            userId: memberUser.id,
            householdId,
            role: Role.VIEWER
          }
        });

        const identity = await tx.matrixIdentity.upsert({
          where: { userId: memberUser.id },
          update: {
            matrixUserId: entry.matrixUserId?.trim() || `@${matrixLocalpart(normalizedEmail)}:lifeos.local`,
            ...(entry.displayName !== undefined ? { displayName: trimToNull(entry.displayName) } : {})
          },
          create: {
            userId: memberUser.id,
            matrixUserId: entry.matrixUserId?.trim() || `@${matrixLocalpart(normalizedEmail)}:lifeos.local`,
            displayName: trimToNull(entry.displayName)
          }
        });

        const membership = await tx.matrixRoomMembership.upsert({
          where: { roomId_userId: { roomId: room.id, userId: memberUser.id } },
          update: { membership: entry.membership },
          create: { roomId: room.id, userId: memberUser.id, membership: entry.membership }
        });

        result.push({
          email: normalizedEmail,
          membership: membership.membership,
          matrixUserId: identity.matrixUserId
        });
      }

      return result;
    });

    res.json({ roomId: room.id, syncedCount: synced.length, members: synced });
  });

  router.post("/rooms/:roomId/relay", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const payload = relayHookSchema.parse(req.body ?? {});

    const room = await prisma.matrixRoom.findFirst({
      where: { id: req.params.roomId, householdId }
    });

    if (!room) {
      res.status(404).json({ message: "Matrix room not found" });
      return;
    }

    const event = await prisma.matrixRelayEvent.upsert({
      where: {
        roomId_externalEventId: {
          roomId: room.id,
          externalEventId: payload.externalEventId.trim()
        }
      },
      update: {
        eventType: payload.eventType.trim(),
        senderMatrixUserId: trimToNull(payload.senderMatrixUserId),
        ...(payload.payload !== undefined ? { payload: payload.payload ?? Prisma.DbNull } : {})
      },
      create: {
        roomId: room.id,
        externalEventId: payload.externalEventId.trim(),
        eventType: payload.eventType.trim(),
        senderMatrixUserId: trimToNull(payload.senderMatrixUserId),
        ...(payload.payload !== undefined ? { payload: payload.payload ?? Prisma.DbNull } : {})
      }
    });

    for (const unread of payload.unreadByEmail) {
      const email = unread.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) continue;

      await prisma.matrixRoomMembership.updateMany({
        where: { roomId: room.id, userId: user.id },
        data: {
          unreadCount: unread.unreadCount,
          notificationCount: unread.notificationCount
        }
      });
    }

    res.json({
      roomId: room.id,
      eventId: event.id,
      externalEventId: event.externalEventId,
      updatedUnreadEntries: payload.unreadByEmail.length
    });
  });

  return router;
}
