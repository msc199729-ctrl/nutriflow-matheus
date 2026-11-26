-- Duração da consulta em minutos, decidida por quem agenda.
-- O default 60 preserva as consultas existentes: o calendário sempre as
-- desenhou com 1h.
ALTER TABLE "consultas_agendadas"
  ADD COLUMN "duracao_min" INTEGER NOT NULL DEFAULT 60;
