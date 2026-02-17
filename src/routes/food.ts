import { InventorySubtype, PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { ensureContext } from "../domain.js";

const ingredientInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1).max(40)
});

const createRecipeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  ingredients: z.array(ingredientInputSchema).min(1)
});

const updateRecipeSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  ingredients: z.array(ingredientInputSchema).min(1).optional()
});

const foodStockMutationSchema = z
  .object({
    action: z.enum(["add", "use", "adjust"]),
    quantity: z.coerce.number().finite(),
    expiresAt: z.string().datetime().optional().nullable(),
    note: z.string().trim().max(500).optional().nullable()
  })
  .superRefine((value, ctx) => {
    if ((value.action === "add" || value.action === "use") && value.quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "Quantity must be greater than 0 for add/use actions"
      });
    }
    if (value.action === "adjust" && value.quantity < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "Quantity must be at least 0 for adjust action"
      });
    }
  });

function trimToNull(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapRecipe(recipe: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  ingredients: Array<{ id: string; name: string; quantity: any; unit: string; createdAt: Date }>;
}) {
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    ingredients: recipe.ingredients
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        quantity: Number(ingredient.quantity),
        unit: ingredient.unit,
        createdAt: ingredient.createdAt
      }))
  };
}

export function createFoodRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/recipes", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const recipes = await prisma.recipe.findMany({
      where: { householdId },
      include: { ingredients: true },
      orderBy: [{ name: "asc" }]
    });

    res.json(recipes.map(mapRecipe));
  });

  router.post("/recipes", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const payload = createRecipeSchema.parse(req.body ?? {});

    const created = await prisma.recipe.create({
      data: {
        householdId,
        name: payload.name.trim(),
        description: trimToNull(payload.description),
        ingredients: {
          create: payload.ingredients.map((ingredient) => ({
            name: ingredient.name.trim(),
            quantity: ingredient.quantity,
            unit: ingredient.unit.trim().toLowerCase()
          }))
        }
      },
      include: { ingredients: true }
    });

    res.status(201).json(mapRecipe(created));
  });

  router.patch("/recipes/:id", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const payload = updateRecipeSchema.parse(req.body ?? {});

    const existing = await prisma.recipe.findFirst({
      where: { id: req.params.id, householdId }
    });

    if (!existing) {
      res.status(404).json({ message: "Recipe not found" });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.recipe.update({
        where: { id: req.params.id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
          ...(payload.description !== undefined ? { description: trimToNull(payload.description) } : {})
        }
      });

      if (payload.ingredients) {
        await tx.recipeIngredient.deleteMany({ where: { recipeId: req.params.id } });
        await tx.recipeIngredient.createMany({
          data: payload.ingredients.map((ingredient) => ({
            recipeId: req.params.id,
            name: ingredient.name.trim(),
            quantity: ingredient.quantity,
            unit: ingredient.unit.trim().toLowerCase()
          }))
        });
      }

      return tx.recipe.findUniqueOrThrow({
        where: { id: req.params.id },
        include: { ingredients: true }
      });
    });

    res.json(mapRecipe(updated));
  });

  router.delete("/recipes/:id", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);
    const removed = await prisma.recipe.deleteMany({
      where: { id: req.params.id, householdId }
    });

    if (removed.count === 0) {
      res.status(404).json({ message: "Recipe not found" });
      return;
    }

    res.status(204).send();
  });

  router.get("/recipes/:id/availability", async (req, res) => {
    const { householdId } = await ensureContext(prisma, req);

    const recipe = await prisma.recipe.findFirst({
      where: { id: req.params.id, householdId },
      include: { ingredients: true }
    });

    if (!recipe) {
      res.status(404).json({ message: "Recipe not found" });
      return;
    }

    const foodItems = await prisma.inventoryItem.findMany({
      where: {
        householdId,
        subtype: InventorySubtype.FOOD,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }]
      },
      select: { name: true, unit: true, quantity: true }
    });

    const availableByIngredient = new Map<string, number>();

    for (const item of foodItems) {
      const key = `${item.name.trim().toLowerCase()}::${item.unit.trim().toLowerCase()}`;
      availableByIngredient.set(key, (availableByIngredient.get(key) ?? 0) + Number(item.quantity));
    }

    const ingredientChecks = recipe.ingredients
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((ingredient) => {
        const normalizedName = ingredient.name.trim().toLowerCase();
        const normalizedUnit = ingredient.unit.trim().toLowerCase();
        const key = `${normalizedName}::${normalizedUnit}`;
        const required = Number(ingredient.quantity);
        const available = availableByIngredient.get(key) ?? 0;
        const missingQuantity = Math.max(required - available, 0);
        const status = available >= required ? "enough" : available > 0 ? "partial" : "missing";

        return {
          ingredientId: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          required,
          available,
          missingQuantity,
          status
        };
      });

    const shortages = ingredientChecks.filter((entry) => entry.missingQuantity > 0);

    res.json({
      recipeId: recipe.id,
      feasible: shortages.length === 0,
      ingredients: ingredientChecks,
      shortages
    });
  });

  router.post("/stock/:id/mutate", async (req, res) => {
    const { householdId, user } = await ensureContext(prisma, req);
    const payload = foodStockMutationSchema.parse(req.body ?? {});

    const existing = await prisma.inventoryItem.findFirst({
      where: { id: req.params.id, householdId, subtype: InventorySubtype.FOOD }
    });

    if (!existing) {
      res.status(404).json({ message: "Food stock item not found" });
      return;
    }

    const currentQuantity = Number(existing.quantity);
    const nextQuantity =
      payload.action === "add"
        ? currentQuantity + payload.quantity
        : payload.action === "use"
          ? currentQuantity - payload.quantity
          : payload.quantity;
    const delta = nextQuantity - currentQuantity;

    if (nextQuantity < 0) {
      res.status(409).json({
        message: "Stock transition rejected: quantity would become negative",
        currentQuantity,
        attemptedDelta: delta
      });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.update({
        where: { id: existing.id },
        data: {
          quantity: nextQuantity,
          ...(payload.expiresAt !== undefined ? { expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null } : {})
        }
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: `food_stock_${payload.action}`,
          entityType: "InventoryItem",
          entityId: existing.id,
          payload: {
            itemName: updated.name,
            unit: updated.unit,
            beforeQuantity: currentQuantity,
            delta,
            afterQuantity: Number(updated.quantity),
            expiresAt: updated.expiresAt?.toISOString() ?? null,
            note: trimToNull(payload.note),
            action: payload.action
          }
        }
      });

      return updated;
    });

    res.json({
      id: result.id,
      name: result.name,
      subtype: result.subtype,
      quantity: Number(result.quantity),
      unit: result.unit,
      expiresAt: result.expiresAt,
      delta
    });
  });

  return router;
}
