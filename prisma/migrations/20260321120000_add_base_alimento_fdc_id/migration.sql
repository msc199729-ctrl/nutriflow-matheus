-- AlterTable
ALTER TABLE "base_alimentos" ADD COLUMN "fdc_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "base_alimentos_fdc_id_key" ON "base_alimentos"("fdc_id");
