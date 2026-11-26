-- Meta de água padrão do paciente (o plano pode sobrescrever).
ALTER TABLE "pacientes" ADD COLUMN "meta_agua_ml" DOUBLE PRECISION;

-- Valor atual da meta, para calcular progresso.
ALTER TABLE "metas" ADD COLUMN "valor_atual" DOUBLE PRECISION;
