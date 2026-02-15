import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createApp } from "./app.js";

function basePrismaMock() {
  return {
    user: { upsert: vi.fn() },
    membership: { findFirst: vi.fn(), create: vi.fn(), upsert: vi.fn() },
    household: { create: vi.fn() },
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn()
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
    $transaction: vi.fn(async (cb: (tx: any) => Promise<void>) => cb({ task: { update: vi.fn() }, auditLog: { create: vi.fn() } }))
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
});
