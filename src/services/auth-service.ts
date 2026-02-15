import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(1).max(120).optional()
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

type AttemptState = {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
};

const attempts = new Map<string, AttemptState>();
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export class AuthServiceError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function keyFor(ip: string, email: string) {
  return `${ip}|${email}`;
}

function getClientIp(raw?: string) {
  return raw || "unknown";
}

function currentState(key: string, now: number): AttemptState {
  const existing = attempts.get(key);
  if (!existing) {
    return { failures: 0, firstFailureAt: now, lockedUntil: 0 };
  }
  if (now - existing.firstFailureAt > FAILURE_WINDOW_MS) {
    return { failures: 0, firstFailureAt: now, lockedUntil: 0 };
  }
  return existing;
}

export async function registerUserWithPassword(
  prisma: PrismaClient,
  payload: z.infer<typeof registerInputSchema>
): Promise<AuthUser> {
  const email = normalizeEmail(payload.email);
  const passwordHash = await bcrypt.hash(payload.password, 12);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      displayName: true,
      passwordHash: true
    }
  });

  if (existing?.passwordHash) {
    throw new AuthServiceError(409, "Email already registered");
  }

  const displayName = payload.displayName?.trim() || email.split("@")[0];

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, displayName },
      select: { id: true, email: true, displayName: true }
    });
  }

  const created = await prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash
    },
    select: { id: true, email: true, displayName: true }
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: created.id },
    select: { id: true }
  });

  if (!membership) {
    await prisma.household.create({
      data: {
        name: `${email} household`,
        memberships: {
          create: {
            userId: created.id,
            role: Role.OWNER
          }
        }
      }
    });
  }

  return created;
}

export async function loginUserWithPassword(
  prisma: PrismaClient,
  payload: z.infer<typeof loginInputSchema>,
  options?: { ip?: string; now?: number }
): Promise<AuthUser> {
  const email = normalizeEmail(payload.email);
  const now = options?.now ?? Date.now();
  const attemptKey = keyFor(getClientIp(options?.ip), email);
  const state = currentState(attemptKey, now);

  if (state.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((state.lockedUntil - now) / 1000);
    throw new AuthServiceError(429, "Too many failed login attempts", { retryAfterSeconds });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true, passwordHash: true }
  });

  if (!user?.passwordHash) {
    const nextFailures = state.failures + 1;
    attempts.set(attemptKey, {
      failures: nextFailures,
      firstFailureAt: state.failures === 0 ? now : state.firstFailureAt,
      lockedUntil: nextFailures >= MAX_FAILURES ? now + LOCK_MS : 0
    });
    throw new AuthServiceError(401, "Invalid credentials");
  }

  const valid = await bcrypt.compare(payload.password, user.passwordHash);
  if (!valid) {
    const nextFailures = state.failures + 1;
    attempts.set(attemptKey, {
      failures: nextFailures,
      firstFailureAt: state.failures === 0 ? now : state.firstFailureAt,
      lockedUntil: nextFailures >= MAX_FAILURES ? now + LOCK_MS : 0
    });
    throw new AuthServiceError(401, "Invalid credentials");
  }

  attempts.delete(attemptKey);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName
  };
}

export function resetAuthServiceStateForTests() {
  attempts.clear();
}
