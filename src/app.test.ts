import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createApp } from "./app.js";

function basePrismaMock() {
  return {
    user: { upsert: vi.fn(), findUnique: vi.fn() },
    membership: { findFirst: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    household: { create: vi.fn() },
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn()
    },
    inventoryItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn()
    },
    recipe: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn()
    },
    recipeIngredient: {
      deleteMany: vi.fn(),
      createMany: vi.fn()
    },
    matrixIdentity: {
      upsert: vi.fn()
    },
    matrixRoom: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn()
    },
    matrixRoomMembership: {
      upsert: vi.fn(),
      updateMany: vi.fn()
    },
    matrixRelayEvent: {
      upsert: vi.fn()
    },
    workSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn()
    },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<void>) =>
      cb({
        task: { update: vi.fn() },
        auditLog: { create: vi.fn() },
        inventoryItem: { update: vi.fn() },
        recipe: { update: vi.fn(), findUniqueOrThrow: vi.fn() },
        recipeIngredient: { deleteMany: vi.fn(), createMany: vi.fn() },
        user: { upsert: vi.fn() },
        membership: { upsert: vi.fn() },
        matrixIdentity: { upsert: vi.fn() },
        matrixRoomMembership: { upsert: vi.fn() }
      })
    )
  };
}

describe("lifeos-api integration routes", () => {
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = "12345678901234567890123456789012";
  });

  it("creates a task", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.membership.upsert.mockResolvedValue({});
    prisma.task.create.mockResolvedValue({
      id: "t1",
      title: "Write tests",
      description: null,
      area: "WORK",
      project: "Core",
      status: "TODO",
      startedOn: null,
      finishedOn: null,
      createdAt: new Date("2026-02-15T00:00:00.000Z"),
      owner: { email: "dev@example.com" }
    });

    const app = createApp(prisma as any);
    const res = await request(app)
      .post("/tasks")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com")
      .send({ title: "Write tests", area: "WORK", project: "Core" });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Write tests");
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });

  it("does not stop already-ended session by explicit sessionId", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.workSession.findFirst.mockResolvedValue(null);

    const app = createApp(prisma as any);
    const res = await request(app)
      .post("/worktime/stop")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com")
      .send({ sessionId: "closed-session" });

    expect(res.status).toBe(404);
    expect(prisma.workSession.findFirst).toHaveBeenCalledWith({
      where: { id: "closed-session", userId: "u1", endedAt: null }
    });
  });

  it("returns automation dry-run plan", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.task.findMany.mockResolvedValue([
      {
        id: "t1",
        title: "Old TODO",
        area: "WORK",
        project: null,
        status: "TODO",
        startedOn: null,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        owner: { email: "dev@example.com" }
      }
    ]);

    const app = createApp(prisma as any);
    const res = await request(app)
      .post("/automation/plan-day")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com")
      .send({ mode: "dry_run", area: "WORK", limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("dry_run");
    expect(res.body.selected).toHaveLength(1);
    expect(res.body.changes).toHaveLength(1);
  });

  it("reports ready when dependency checks pass", async () => {
    const prisma = basePrismaMock();
    const app = createApp(prisma as any, {
      readinessCheck: async () => ({
        status: "ready",
        checks: { database: "up", redis: "up" }
      })
    });

    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks.database).toBe("up");
    expect(res.body.checks.redis).toBe("up");
  });

  it("reports not_ready when a dependency check fails", async () => {
    const prisma = basePrismaMock();
    const app = createApp(prisma as any, {
      readinessCheck: async () => ({
        status: "not_ready",
        checks: { database: "up", redis: "down" }
      })
    });

    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.checks.database).toBe("up");
    expect(res.body.checks.redis).toBe("down");
  });

  it("returns 401 when actor header is missing", async () => {
    const prisma = basePrismaMock();
    const app = createApp(prisma as any);

    const res = await request(app)
      .get("/tasks")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("x-user-email");
  });

  it("returns 400 when actor header is invalid", async () => {
    const prisma = basePrismaMock();
    const app = createApp(prisma as any);

    const res = await request(app)
      .get("/tasks")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "not-an-email");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("x-user-email");
  });

  it("creates an inventory item", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.inventoryItem.create.mockResolvedValue({
      id: "i1",
      name: "Rice",
      subtype: "FOOD",
      quantity: 2,
      unit: "kg",
      category: "Dry goods",
      location: "Pantry",
      createdAt: new Date("2026-02-17T00:00:00.000Z"),
      updatedAt: new Date("2026-02-17T00:00:00.000Z")
    });

    const app = createApp(prisma as any);
    const res = await request(app)
      .post("/inventory")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com")
      .send({ name: "Rice", subtype: "FOOD", quantity: 2, unit: "kg", category: "Dry goods", location: "Pantry" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Rice");
    expect(res.body.subtype).toBe("FOOD");
  });

  it("filters inventory items by subtype", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.inventoryItem.findMany.mockResolvedValue([]);

    const app = createApp(prisma as any);
    const res = await request(app)
      .get("/inventory?subtype=FOOD")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com");

    expect(res.status).toBe(200);
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: { householdId: "h1", subtype: "FOOD" },
      orderBy: [{ subtype: "asc" }, { name: "asc" }]
    });
  });

  it("creates a food recipe", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.recipe.create.mockResolvedValue({
      id: "r1",
      name: "Pancakes",
      description: "Quick breakfast",
      createdAt: new Date("2026-02-17T00:00:00.000Z"),
      updatedAt: new Date("2026-02-17T00:00:00.000Z"),
      ingredients: [
        {
          id: "ri1",
          name: "Flour",
          quantity: 0.3,
          unit: "kg",
          createdAt: new Date("2026-02-17T00:00:00.000Z")
        }
      ]
    });

    const app = createApp(prisma as any);
    const res = await request(app)
      .post("/food/recipes")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com")
      .send({
        name: "Pancakes",
        description: "Quick breakfast",
        ingredients: [{ name: "Flour", quantity: 0.3, unit: "kg" }]
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Pancakes");
    expect(res.body.ingredients).toHaveLength(1);
  });

  it("returns recipe shortages from food inventory", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.recipe.findFirst.mockResolvedValue({
      id: "r1",
      ingredients: [
        { id: "ri1", name: "Flour", quantity: 0.3, unit: "kg" },
        { id: "ri2", name: "Milk", quantity: 1, unit: "l" },
        { id: "ri3", name: "Egg", quantity: 3, unit: "item" }
      ]
    });
    prisma.inventoryItem.findMany.mockResolvedValue([
      { name: "Flour", quantity: 1.0, unit: "kg" },
      { name: "Milk", quantity: 0.25, unit: "l" },
      { name: "Stapler", quantity: 2, unit: "item" }
    ]);

    const app = createApp(prisma as any);
    const res = await request(app)
      .get("/food/recipes/r1/availability")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com");

    expect(res.status).toBe(200);
    expect(res.body.feasible).toBe(false);
    expect(res.body.shortages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Milk", missingQuantity: 0.75, status: "partial" }),
        expect.objectContaining({ name: "Egg", missingQuantity: 3, status: "missing" })
      ])
    );
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
      where: {
        householdId: "h1",
        subtype: "FOOD",
        OR: [{ expiresAt: null }, { expiresAt: { gte: expect.any(Date) } }]
      },
      select: { name: true, unit: true, quantity: true }
    });
  });

  it("applies safe food stock use mutation and writes audit entry", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.inventoryItem.findFirst.mockResolvedValue({
      id: "i1",
      householdId: "h1",
      name: "Rice",
      subtype: "FOOD",
      quantity: 5,
      unit: "kg"
    });
    prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
      cb({
        inventoryItem: {
          update: vi.fn().mockResolvedValue({
            id: "i1",
            name: "Rice",
            subtype: "FOOD",
            quantity: 3,
            unit: "kg",
            expiresAt: null
          })
        },
        auditLog: { create: vi.fn().mockResolvedValue({ id: "a1" }) }
      })
    );

    const app = createApp(prisma as any);
    const res = await request(app)
      .post("/food/stock/i1/mutate")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com")
      .send({ action: "use", quantity: 2, note: "Dinner prep" });

    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(3);
    expect(res.body.delta).toBe(-2);
  });

  it("rejects food stock mutation that would create negative quantity", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.inventoryItem.findFirst.mockResolvedValue({
      id: "i1",
      householdId: "h1",
      name: "Milk",
      subtype: "FOOD",
      quantity: 1,
      unit: "l"
    });

    const app = createApp(prisma as any);
    const res = await request(app)
      .post("/food/stock/i1/mutate")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com")
      .send({ action: "use", quantity: 2 });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("negative");
  });

  it("bootstraps a matrix room and actor identity", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.matrixRoom.upsert.mockResolvedValue({
      id: "mr1",
      externalRoomId: "!room:example.org",
      alias: "#lifeos:example.org",
      name: "LifeOS Core",
      createdAt: new Date("2026-02-17T00:00:00.000Z"),
      updatedAt: new Date("2026-02-17T00:00:00.000Z")
    });
    prisma.matrixIdentity.upsert.mockResolvedValue({
      matrixUserId: "@dev:example.org"
    });
    prisma.matrixRoomMembership.upsert.mockResolvedValue({
      membership: "JOINED"
    });

    const app = createApp(prisma as any);
    const res = await request(app)
      .post("/matrix/rooms/bootstrap")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com")
      .send({
        externalRoomId: "!room:example.org",
        name: "LifeOS Core",
        alias: "#lifeos:example.org",
        actorMatrixUserId: "@dev:example.org"
      });

    expect(res.status).toBe(201);
    expect(res.body.room.externalRoomId).toBe("!room:example.org");
    expect(res.body.actor.membership).toBe("JOINED");
  });

  it("syncs matrix room membership for household users", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.matrixRoom.findFirst.mockResolvedValue({ id: "mr1", householdId: "h1" });

    prisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) =>
      cb({
        user: {
          upsert: vi.fn().mockResolvedValue({ id: "u2", email: "cook@example.com" })
        },
        membership: { upsert: vi.fn().mockResolvedValue({ id: "m2" }) },
        matrixIdentity: { upsert: vi.fn().mockResolvedValue({ matrixUserId: "@cook:example.org" }) },
        matrixRoomMembership: { upsert: vi.fn().mockResolvedValue({ membership: "INVITED" }) }
      })
    );

    const app = createApp(prisma as any);
    const res = await request(app)
      .post("/matrix/rooms/mr1/sync-membership")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com")
      .send({
        members: [{ email: "cook@example.com", membership: "INVITED", matrixUserId: "@cook:example.org" }]
      });

    expect(res.status).toBe(200);
    expect(res.body.syncedCount).toBe(1);
    expect(res.body.members[0].membership).toBe("INVITED");
  });

  it("accepts matrix relay hook and updates unread counts", async () => {
    const prisma = basePrismaMock();
    prisma.user.upsert.mockResolvedValue({ id: "u1", email: "dev@example.com" });
    prisma.membership.findFirst.mockResolvedValue({ householdId: "h1" });
    prisma.matrixRoom.findFirst.mockResolvedValue({ id: "mr1", householdId: "h1" });
    prisma.matrixRelayEvent.upsert.mockResolvedValue({
      id: "re1",
      externalEventId: "$event1"
    });
    prisma.user.findUnique.mockResolvedValue({ id: "u2", email: "cook@example.com" });
    prisma.matrixRoomMembership.updateMany.mockResolvedValue({ count: 1 });

    const app = createApp(prisma as any);
    const res = await request(app)
      .post("/matrix/rooms/mr1/relay")
      .set("x-internal-api-key", process.env.INTERNAL_API_KEY!)
      .set("x-user-email", "dev@example.com")
      .send({
        externalEventId: "$event1",
        eventType: "m.room.message",
        unreadByEmail: [{ email: "cook@example.com", unreadCount: 4, notificationCount: 1 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.externalEventId).toBe("$event1");
    expect(res.body.updatedUnreadEntries).toBe(1);
  });
});
