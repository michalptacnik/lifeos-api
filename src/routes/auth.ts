import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { AuthServiceError, loginInputSchema, loginUserWithPassword, registerInputSchema, registerUserWithPassword } from "../services/auth-service.js";

export function createAuthRouter(prisma: PrismaClient) {
  const router = Router();

  router.post("/register", async (req, res) => {
    try {
      const payload = registerInputSchema.parse(req.body);
      const user = await registerUserWithPassword(prisma, payload);
      res.status(201).json({ user });
    } catch (error) {
      if (error instanceof AuthServiceError) {
        res.status(error.status).json({ message: error.message, ...(error.details ? error.details : {}) });
        return;
      }
      res.status(400).json({ message: (error as Error).message });
    }
  });

  router.post("/login", async (req, res) => {
    try {
      const payload = loginInputSchema.parse(req.body);
      const user = await loginUserWithPassword(prisma, payload, { ip: req.ip });
      res.json({ user });
    } catch (error) {
      if (error instanceof AuthServiceError) {
        res.status(error.status).json({ message: error.message, ...(error.details ? error.details : {}) });
        return;
      }
      res.status(400).json({ message: (error as Error).message });
    }
  });

  return router;
}
