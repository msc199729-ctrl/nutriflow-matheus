ALTER TABLE "consultas_agendadas"
ALTER COLUMN "inicio" TYPE TIMESTAMPTZ(3)
USING "inicio" AT TIME ZONE 'America/Sao_Paulo';
