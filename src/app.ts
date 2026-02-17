import cors from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import type { PrismaClient } from "@prisma/client";
import { createAutomationRouter } from "./routes/automation.js";
import { createCalendarRouter } from "./routes/calendar.js";
import { createAuthRouter } from "./routes/auth.js";
import { createMeRouter } from "./routes/me.js";
import { createTasksRouter } from "./routes/tasks.js";
import { createWorktimeRouter } from "./routes/worktime.js";
import { hasStrongInternalKey, safeEqual } from "./security.js";

const internalHeader = "x-internal-api-key";

export function createApp(prisma: PrismaClient) {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    if (req.path === "/health" || req.path === "/auth/login" || req.path === "/auth/register") {
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

    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "lifeos-api" });
  });

  app.use("/tasks", createTasksRouter(prisma));
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
