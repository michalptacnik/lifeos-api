import cors from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import type { PrismaClient } from "@prisma/client";
import { createAutomationRouter } from "./routes/automation.js";
import { createCalendarRouter } from "./routes/calendar.js";
import { createAuthRouter } from "./routes/auth.js";
import { actorHeader } from "./domain.js";
import { createInventoryRouter } from "./routes/inventory.js";
import { createMeRouter } from "./routes/me.js";
import { createTasksRouter } from "./routes/tasks.js";
import { createWorktimeRouter } from "./routes/worktime.js";
import { hasStrongInternalKey, isValidActorEmail, safeEqual } from "./security.js";
import { type ReadinessCheck } from "./readiness.js";

const internalHeader = "x-internal-api-key";

export function createApp(prisma: PrismaClient, options?: { readinessCheck?: ReadinessCheck }) {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    if (req.path === "/health" || req.path === "/ready" || req.path === "/auth/login" || req.path === "/auth/register") {
      next();
      return;
    }

    const expectedInternalKey = process.env.INTERNAL_API_KEY;
    if (!hasStrongInternalKey(expectedInternalKey)) {
      res.status(500).json({ message: "Server misconfigured: INTERNAL_API_KEY missing" });
      return;
    }

    const received = req.header(internalHeader);
    if (!received || !safeEqual(received, expectedInternalKey as string)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const rawActorEmail = req.header(actorHeader)?.trim().toLowerCase();
    if (!rawActorEmail) {
      res.status(401).json({ message: `Missing required header: ${actorHeader}` });
      return;
    }
    if (!isValidActorEmail(rawActorEmail)) {
      res.status(400).json({ message: `Invalid required header: ${actorHeader}` });
      return;
    }
    req.headers[actorHeader] = rawActorEmail;

    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "lifeos-api" });
  });

  app.get("/ready", async (_req, res) => {
    if (!options?.readinessCheck) {
      res.json({
        status: "ready",
        service: "lifeos-api",
        checks: { database: "up", redis: "up" }
      });
      return;
    }

    const result = await options.readinessCheck();
    const httpCode = result.status === "ready" ? 200 : 503;
    res.status(httpCode).json({ service: "lifeos-api", ...result });
  });

  app.use("/tasks", createTasksRouter(prisma));
  app.use("/inventory", createInventoryRouter(prisma));
  app.use("/worktime", createWorktimeRouter(prisma));
  app.use("/automation", createAutomationRouter(prisma));
  app.use("/calendar", createCalendarRouter(prisma));
  app.use("/auth", createAuthRouter(prisma));
  app.use("/me", createMeRouter(prisma));

  app.use((err: Error, _req: Request, res: Response, _next: () => void) => {
    res.status(500).json({ message: err.message });
  });

  return app;
}
