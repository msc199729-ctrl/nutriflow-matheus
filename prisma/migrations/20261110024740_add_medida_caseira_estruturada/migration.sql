-- AlterTable
ALTER TABLE "itens_dieta" ADD COLUMN     "id_medida_caseira" TEXT,
ADD COLUMN     "quantidade_medida" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "itens_dieta" ADD CONSTRAINT "itens_dieta_id_medida_caseira_fkey" FOREIGN KEY ("id_medida_caseira") REFERENCES "MedidaCaseira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
