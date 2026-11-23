-- Enriquecimento nutricional da base_alimentos (Frente 1: micros TBCA completos)
-- Fonte: dump TBCA já existente em prisma/data/alimentos-tbca.jsonl (perfil completo
-- de ~35 nutrientes por alimento que o seed antigo descartava na gravação).
-- Backfill: prisma/backfill-micros-tbca.ts

-- Minerais
ALTER TABLE "base_alimentos" ADD COLUMN "calcio" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "ferro" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "magnesio" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "fosforo" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "potassio" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "zinco" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "cobre" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "selenio" DOUBLE PRECISION;

-- Vitaminas
ALTER TABLE "base_alimentos" ADD COLUMN "vitamina_a_re" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "vitamina_a_rae" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "vitamina_d" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "vitamina_e" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "tiamina" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "vitamina_b2" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "vitamina_b3" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "vitamina_b6" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "vitamina_b12" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "vitamina_c" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "folato" DOUBLE PRECISION;

-- Lipídeos
ALTER TABLE "base_alimentos" ADD COLUMN "colesterol" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "gordura_saturada" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "gordura_monoinsaturada" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "gordura_poliinsaturada" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "gordura_trans" DOUBLE PRECISION;

-- Outros
ALTER TABLE "base_alimentos" ADD COLUMN "umidade" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "carboidrato_total" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "acucar_adicao" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "sal_adicao" DOUBLE PRECISION;
ALTER TABLE "base_alimentos" ADD COLUMN "alcool" DOUBLE PRECISION;
