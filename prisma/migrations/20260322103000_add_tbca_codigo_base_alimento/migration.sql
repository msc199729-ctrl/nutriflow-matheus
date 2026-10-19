-- AlterTable
ALTER TABLE "base_alimentos" ADD COLUMN "codigo_tbca" TEXT,
ADD COLUMN "classe_tbca" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "base_alimentos_codigo_tbca_key" ON "base_alimentos"("codigo_tbca");
