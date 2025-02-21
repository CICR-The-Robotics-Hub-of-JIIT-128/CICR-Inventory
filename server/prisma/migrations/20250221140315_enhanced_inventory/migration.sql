/*
  Warnings:

  - A unique constraint covering the columns `[serialNumber]` on the table `InventoryItem` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'MANAGER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Status" ADD VALUE 'IN_MAINTENANCE';
ALTER TYPE "Status" ADD VALUE 'OUT_OF_STOCK';
ALTER TYPE "Status" ADD VALUE 'DISCONTINUED';

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "description" TEXT,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "minimumStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "price" DOUBLE PRECISION,
ADD COLUMN     "purchaseDate" TIMESTAMP(3),
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "warrantyExpiry" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_serialNumber_key" ON "InventoryItem"("serialNumber");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
