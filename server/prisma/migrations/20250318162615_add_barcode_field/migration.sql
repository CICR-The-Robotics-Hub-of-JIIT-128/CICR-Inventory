/*
  Warnings:

  - A unique constraint covering the columns `[barcode]` on the table `InventoryItem` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "barcode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_barcode_key" ON "InventoryItem"("barcode");
