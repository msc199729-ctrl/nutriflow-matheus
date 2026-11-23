-- CreateTable
CREATE TABLE "MedidaCaseira" (
    "id" TEXT NOT NULL,
    "alimentoId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "gramas" DECIMAL(8,2) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedidaCaseira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedidaCaseira_alimentoId_idx" ON "MedidaCaseira"("alimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "MedidaCaseira_alimentoId_nome_key" ON "MedidaCaseira"("alimentoId", "nome");

-- AddForeignKey
ALTER TABLE "MedidaCaseira" ADD CONSTRAINT "MedidaCaseira_alimentoId_fkey" FOREIGN KEY ("alimentoId") REFERENCES "base_alimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
