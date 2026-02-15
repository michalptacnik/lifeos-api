import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { loginUserWithPassword, registerUserWithPassword, resetAuthServiceStateForTests, AuthServiceError } from "./auth-service.js";

function prismaMock() {
  return {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    membership: {
      findFirst: vi.fn()
    },
    household: {
      create: vi.fn()
    }
  };
}

describe("auth-service", () => {
  beforeEach(() => {
    resetAuthServiceStateForTests();
  });

  it("registers a new user and creates household membership", async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "u1",
      email: "new@example.com",
      displayName: "New"
    });
    prisma.membership.findFirst.mockResolvedValue(null);

    const user = await registerUserWithPassword(prisma as any, {
      email: "new@example.com",
      password: "password123",
      displayName: "New"
    });

    expect(user.email).toBe("new@example.com");
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.household.create).toHaveBeenCalledTimes(1);
  });

  it("rejects register when email already has password auth", async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "existing@example.com",
      displayName: "Existing",
      passwordHash: "hashed"
    });

    await expect(
      registerUserWithPassword(prisma as any, {
        email: "existing@example.com",
        password: "password123"
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("authenticates valid credentials", async () => {
    const prisma = prismaMock();
    const passwordHash = await bcrypt.hash("password", 12);
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "admin@example.com",
      displayName: "Admin",
      passwordHash
    });

    const user = await loginUserWithPassword(prisma as any, {
      email: "admin@example.com",
      password: "password"
    }, { ip: "1.1.1.1" });

    expect(user.email).toBe("admin@example.com");
  });

  it("locks login attempts after repeated failures", async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue(null);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        loginUserWithPassword(prisma as any, { email: "a@b.com", password: "wrong" }, { ip: "2.2.2.2", now: 1000 + i })
      ).rejects.toBeInstanceOf(AuthServiceError);
    }

    await expect(
      loginUserWithPassword(prisma as any, { email: "a@b.com", password: "wrong" }, { ip: "2.2.2.2", now: 1100 })
    ).rejects.toMatchObject({ status: 429 });
  });
});
