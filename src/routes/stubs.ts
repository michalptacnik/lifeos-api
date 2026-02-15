import { Router } from "express";

export function createStubRouter() {
  const router = Router();

  router.get("/budgets", (_req, res) => res.status(501).json({ message: "Not implemented" }));
  router.post("/budgets", (_req, res) => res.status(501).json({ message: "Not implemented" }));
  router.get("/inventory", (_req, res) => res.status(501).json({ message: "Not implemented" }));
  router.post("/inventory", (_req, res) => res.status(501).json({ message: "Not implemented" }));
  router.get("/obligations", (_req, res) => res.status(501).json({ message: "Not implemented" }));
  router.post("/obligations", (_req, res) => res.status(501).json({ message: "Not implemented" }));

  return router;
}
