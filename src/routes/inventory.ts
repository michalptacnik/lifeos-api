import { InventorySubtype, PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { ensureContext } from "../domain.js";

const createInventorySchema = z.object({
  name: z.string().trim().min(1),
  subtype: z.nativeEnum(InventorySubtype).optional().default(InventorySubtype.HOME),
  quantity: z.number().positive().optional().default(1),
  unit: z.string().trim().min(1).max(40).optional().default("item"),
  category: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable()
});

const updateInventorySchema = z.object({
  name: z.string().trim().min(1).optional(),
  subtype: z.nativeEnum(InventorySubtype).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  category: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable()
});

function trimToNull(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapInventoryItem(item: {
  id: string;
  name: string;
  subtype: InventorySubtype;
  quantity: any;
  unit: string;
  category: string | null;
  location: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    name: item.name,
    subtype: item.subtype,
    quantity: Number(item.quantity),
    unit: item.unit,
    category: item.category,
    location: item.location,
    expiresAt: item.expiresAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

export function createInventoryRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const subtype = req.query.subtype;
    const resolvedSubtype =
      typeof subtype === "string" && Object.values(InventorySubtype).includes(subtype as InventorySubtype)
        ? (subtype as InventorySubtype)
        : undefined;

    const items = await prisma.inventoryItem.findMany({
      where: {
        householdId,
        ...(resolvedSubtype ? { subtype: resolvedSubtype } : {})
      },
      orderBy: [{ subtype: "asc" }, { name: "asc" }]
    });

    res.json(items.map(mapInventoryItem));
  });

  router.post("/", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const payload = createInventorySchema.parse(req.body ?? {});
    const created = await prisma.inventoryItem.create({
      data: {
        householdId,
        name: payload.name.trim(),
        subtype: payload.subtype,
        quantity: payload.quantity,
        unit: payload.unit.trim(),
        category: trimToNull(payload.category),
        location: trimToNull(payload.location),
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null
      }
    });

    res.status(201).json(mapInventoryItem(created));
  });

  router.patch("/:id", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const payload = updateInventorySchema.parse(req.body ?? {});
    const existing = await prisma.inventoryItem.findFirst({
      where: { id: req.params.id, householdId }
    });

    if (!existing) {
      res.status(404).json({ message: "Inventory item not found" });
      return;
    }

    const updated = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.subtype !== undefined ? { subtype: payload.subtype } : {}),
        ...(payload.quantity !== undefined ? { quantity: payload.quantity } : {}),
        ...(payload.unit !== undefined ? { unit: payload.unit.trim() } : {}),
        ...(payload.category !== undefined ? { category: trimToNull(payload.category) } : {}),
        ...(payload.location !== undefined ? { location: trimToNull(payload.location) } : {}),
        ...(payload.expiresAt !== undefined ? { expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null } : {})
      }
    });

    res.json(mapInventoryItem(updated));
  });

  router.delete("/:id", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const removed = await prisma.inventoryItem.deleteMany({
      where: { id: req.params.id, householdId }
    });

    if (removed.count === 0) {
      res.status(404).json({ message: "Inventory item not found" });
      return;
    }

    res.status(204).send();
  });

  return router;
}
