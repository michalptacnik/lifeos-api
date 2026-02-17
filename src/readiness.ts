import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";

export type ReadinessCheckResult = {
  status: "ready" | "not_ready";
  checks: {
    database: "up" | "down";
    redis: "up" | "down";
  };
};

export type ReadinessCheck = () => Promise<ReadinessCheckResult>;

export function createDependencyReadinessCheck(prisma: PrismaClient, redisUrl: string): ReadinessCheck {
  return async () => {
    const checks: ReadinessCheckResult["checks"] = {
      database: "down",
      redis: "down"
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = "up";
    } catch {
      checks.database = "down";
    }

    const redis = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 1500
      }
    });

    try {
      await redis.connect();
      const pong = await redis.ping();
      checks.redis = pong === "PONG" ? "up" : "down";
    } catch {
      checks.redis = "down";
    } finally {
      if (redis.isOpen) {
        await redis.quit();
      }
    }

    const status = checks.database === "up" && checks.redis === "up" ? "ready" : "not_ready";
    return {
      status,
      checks
    };
  };
}
