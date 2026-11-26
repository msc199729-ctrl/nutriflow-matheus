-- Status da consulta: sem ele agendamento e atendimento eram a mesma coisa.
CREATE TYPE "status_consulta" AS ENUM ('agendada', 'realizada', 'faltou', 'cancelada');

ALTER TABLE "consultas_agendadas"
  ADD COLUMN "status" "status_consulta" NOT NULL DEFAULT 'agendada';

CREATE INDEX "consultas_agendadas_status_idx" ON "consultas_agendadas"("status");
