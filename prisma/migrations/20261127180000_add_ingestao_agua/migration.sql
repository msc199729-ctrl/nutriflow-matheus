-- Tabela de ingestão de água do paciente.
--
-- Separada de `registros_diarios` de propósito: beber água não é refeição. Antes
-- o app do paciente tentava registrar água via `POST /registros-diarios/agua`,
-- rota que não existia, e a alternativa de criar um registro diário por copo
-- poluía o diário alimentar com registros vazios.
--
-- Idempotente: a tabela já foi criada no banco de produção em 27/11/2026 por
-- SQL direto, então `CREATE TABLE` sem `IF NOT EXISTS` faria o
-- `prisma migrate deploy` abortar com 42P07 e travar a fila de migrações.

CREATE TABLE IF NOT EXISTS "ingestoes_agua" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "quantidade_ml" INTEGER NOT NULL,
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestoes_agua_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ingestoes_agua_id_paciente_registrado_em_idx"
    ON "ingestoes_agua"("id_paciente", "registrado_em");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ingestoes_agua_id_paciente_fkey'
  ) THEN
    ALTER TABLE "ingestoes_agua"
      ADD CONSTRAINT "ingestoes_agua_id_paciente_fkey"
      FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
