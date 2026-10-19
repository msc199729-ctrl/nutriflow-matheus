-- AlterTable
ALTER TABLE "registros_diarios" ADD COLUMN     "horas_sono" DOUBLE PRECISION,
ADD COLUMN     "peso_kg" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "treinos" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "tipo" TEXT,
    "duracao_min" INTEGER,
    "intensidade" TEXT,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treinos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT,
    "valor_alvo" DOUBLE PRECISION,
    "unidade" TEXT,
    "prazo" DATE,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treinos_id_paciente_data_idx" ON "treinos"("id_paciente", "data");

-- CreateIndex
CREATE INDEX "metas_id_paciente_idx" ON "metas"("id_paciente");

-- AddForeignKey
ALTER TABLE "treinos" ADD CONSTRAINT "treinos_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas" ADD CONSTRAINT "metas_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
