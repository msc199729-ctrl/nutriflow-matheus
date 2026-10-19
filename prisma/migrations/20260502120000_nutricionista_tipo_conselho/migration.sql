-- CreateEnum
CREATE TYPE "TipoConselho" AS ENUM ('crn', 'crm');

-- AlterTable
ALTER TABLE "nutricionistas" ADD COLUMN "tipo_conselho" "TipoConselho" NOT NULL DEFAULT 'crn';

-- CreateIndex
CREATE INDEX "nutricionistas_tipo_conselho_idx" ON "nutricionistas"("tipo_conselho");
