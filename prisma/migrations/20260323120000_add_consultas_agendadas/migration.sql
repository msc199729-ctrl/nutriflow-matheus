-- CreateTable
CREATE TABLE "consultas_agendadas" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "id_nutricionista" INTEGER NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultas_agendadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consultas_agendadas_id_nutricionista_inicio_idx" ON "consultas_agendadas"("id_nutricionista", "inicio");

-- CreateIndex
CREATE INDEX "consultas_agendadas_id_paciente_idx" ON "consultas_agendadas"("id_paciente");

-- AddForeignKey
ALTER TABLE "consultas_agendadas" ADD CONSTRAINT "consultas_agendadas_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas_agendadas" ADD CONSTRAINT "consultas_agendadas_id_nutricionista_fkey" FOREIGN KEY ("id_nutricionista") REFERENCES "nutricionistas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
