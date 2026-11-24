CREATE TABLE "substitutos_itens" (
    "id" SERIAL NOT NULL,
    "idItemDieta" INTEGER NOT NULL,
    "idAlimento" INTEGER NOT NULL,
    "quantidadeGramas" DOUBLE PRECISION,
    "medidaCaseira" TEXT,
    "idMedidaCaseira" TEXT,
    "quantidadeMedida" DOUBLE PRECISION,
    "aVontade" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "substitutos_itens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "substitutos_itens_idItemDieta_idx" ON "substitutos_itens"("idItemDieta");

ALTER TABLE "substitutos_itens" ADD CONSTRAINT "substitutos_itens_idItemDieta_fkey" FOREIGN KEY ("idItemDieta") REFERENCES "itens_dieta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "substitutos_itens" ADD CONSTRAINT "substitutos_itens_idAlimento_fkey" FOREIGN KEY ("idAlimento") REFERENCES "base_alimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;