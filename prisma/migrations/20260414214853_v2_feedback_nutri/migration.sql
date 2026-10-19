-- CreateEnum
CREATE TYPE "tipo_plano" AS ENUM ('QUALITATIVO', 'POR_ALIMENTOS');

-- ============================================================
-- Pacientes: adicionar cpf e celular
-- ============================================================
ALTER TABLE "pacientes" ADD COLUMN "cpf" TEXT;
ALTER TABLE "pacientes" ADD COLUMN "celular" TEXT;
CREATE UNIQUE INDEX "pacientes_cpf_key" ON "pacientes"("cpf");

-- ============================================================
-- PlanoAlimentar: tipo_plano e descricao_qualitativa
-- ============================================================
ALTER TABLE "planos_alimentares" ADD COLUMN "tipo_plano" "tipo_plano" NOT NULL DEFAULT 'POR_ALIMENTOS';
ALTER TABLE "planos_alimentares" ADD COLUMN "descricao_qualitativa" TEXT;

-- ============================================================
-- ItemDieta: medida_caseira e a_vontade
-- ============================================================
ALTER TABLE "itens_dieta" ADD COLUMN "medida_caseira" TEXT;
ALTER TABLE "itens_dieta" ADD COLUMN "a_vontade" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- AvaliacaoFisica: novos campos de altura e protocolo
-- ============================================================
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "altura_sentado_cm" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "altura_joelho_cm" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "protocolo_gordura" TEXT;

-- ============================================================
-- AvaliacaoFisica: novas dobras cutâneas (7 novas, totalizando 10)
-- ============================================================
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "dobra_bicipital" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "dobra_subescapular" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "dobra_axilar_media" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "dobra_toracica" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "dobra_supra_espinhal" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "dobra_coxa" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "dobra_panturrilha" DOUBLE PRECISION;

-- ============================================================
-- AvaliacaoFisica: circunferência de pescoço (nova)
-- ============================================================
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_pescoco" DOUBLE PRECISION;

-- ============================================================
-- AvaliacaoFisica: circunferências bilaterais (migrar dados antigos → Dir)
-- ============================================================

-- Braço relaxado
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_braco_dir_relaxado" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_braco_esq_relaxado" DOUBLE PRECISION;
UPDATE "avaliacoes_fisicas" SET "circ_braco_dir_relaxado" = "circ_braco_relaxado" WHERE "circ_braco_relaxado" IS NOT NULL;
ALTER TABLE "avaliacoes_fisicas" DROP COLUMN "circ_braco_relaxado";

-- Braço contraído
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_braco_dir_contraido" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_braco_esq_contraido" DOUBLE PRECISION;
UPDATE "avaliacoes_fisicas" SET "circ_braco_dir_contraido" = "circ_braco_contraido" WHERE "circ_braco_contraido" IS NOT NULL;
ALTER TABLE "avaliacoes_fisicas" DROP COLUMN "circ_braco_contraido";

-- Braço CMB
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_braco_dir_cmb" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_braco_esq_cmb" DOUBLE PRECISION;
UPDATE "avaliacoes_fisicas" SET "circ_braco_dir_cmb" = "circ_braco_cmb" WHERE "circ_braco_cmb" IS NOT NULL;
ALTER TABLE "avaliacoes_fisicas" DROP COLUMN "circ_braco_cmb";

-- Antebraço
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_antebraco_dir" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_antebraco_esq" DOUBLE PRECISION;
UPDATE "avaliacoes_fisicas" SET "circ_antebraco_dir" = "circ_antebraco" WHERE "circ_antebraco" IS NOT NULL;
ALTER TABLE "avaliacoes_fisicas" DROP COLUMN "circ_antebraco";

-- Coxa proximal
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_coxa_proximal_dir" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_coxa_proximal_esq" DOUBLE PRECISION;
UPDATE "avaliacoes_fisicas" SET "circ_coxa_proximal_dir" = "circ_coxa_proximal" WHERE "circ_coxa_proximal" IS NOT NULL;
ALTER TABLE "avaliacoes_fisicas" DROP COLUMN "circ_coxa_proximal";

-- Coxa medial
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_coxa_medial_dir" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_coxa_medial_esq" DOUBLE PRECISION;
UPDATE "avaliacoes_fisicas" SET "circ_coxa_medial_dir" = "circ_coxa_medial" WHERE "circ_coxa_medial" IS NOT NULL;
ALTER TABLE "avaliacoes_fisicas" DROP COLUMN "circ_coxa_medial";

-- Coxa distal
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_coxa_distal_dir" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_coxa_distal_esq" DOUBLE PRECISION;
UPDATE "avaliacoes_fisicas" SET "circ_coxa_distal_dir" = "circ_coxa_distal" WHERE "circ_coxa_distal" IS NOT NULL;
ALTER TABLE "avaliacoes_fisicas" DROP COLUMN "circ_coxa_distal";

-- Panturrilha
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_panturrilha_dir" DOUBLE PRECISION;
ALTER TABLE "avaliacoes_fisicas" ADD COLUMN "circ_panturrilha_esq" DOUBLE PRECISION;
UPDATE "avaliacoes_fisicas" SET "circ_panturrilha_dir" = "circ_panturrilha" WHERE "circ_panturrilha" IS NOT NULL;
ALTER TABLE "avaliacoes_fisicas" DROP COLUMN "circ_panturrilha";
