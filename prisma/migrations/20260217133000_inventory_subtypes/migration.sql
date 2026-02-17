-- CreateEnum
CREATE TYPE "InventorySubtype" AS ENUM ('HOME', 'WORK', 'FOOD');

-- AlterTable
ALTER TABLE "InventoryItem"
ADD COLUMN "subtype" "InventorySubtype" NOT NULL DEFAULT 'HOME',
ADD COLUMN "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'item',
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "InventoryItem_householdId_subtype_idx" ON "InventoryItem"("householdId", "subtype");
