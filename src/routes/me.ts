import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { ensureContext } from "../domain.js";

export function createMeRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const { user, householdId } = await ensureContext(prisma, req);
      const membership = await prisma.membership.findFirst({
        where: { userId: user.id, householdId },
        include: { household: true }
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName
        },
        household: membership
          ? {
              id: membership.household.id,
              name: membership.household.name,
              role: membership.role
            }
          : null
      });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  });

  return router;
}
