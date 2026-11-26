-- Exames estruturados: uma coleta com vários biomarcadores.
-- Antes o exame era nota de texto livre, sem comparação entre coletas.

CREATE TABLE "exames_laboratoriais" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "data_coleta" DATE NOT NULL,
    "laboratorio" TEXT,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exames_laboratoriais_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "itens_exame" (
    "id" SERIAL NOT NULL,
    "id_exame" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "valor" DOUBLE PRECISION,
    "unidade" TEXT,
    "referencia_min" DOUBLE PRECISION,
    "referencia_max" DOUBLE PRECISION,
    "resultado_texto" TEXT,

    CONSTRAINT "itens_exame_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exames_laboratoriais_id_paciente_data_coleta_idx"
  ON "exames_laboratoriais"("id_paciente", "data_coleta");
CREATE INDEX "itens_exame_id_exame_idx" ON "itens_exame"("id_exame");
CREATE INDEX "itens_exame_nome_idx" ON "itens_exame"("nome");

ALTER TABLE "exames_laboratoriais" ADD CONSTRAINT "exames_laboratoriais_id_paciente_fkey"
  FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itens_exame" ADD CONSTRAINT "itens_exame_id_exame_fkey"
  FOREIGN KEY ("id_exame") REFERENCES "exames_laboratoriais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
