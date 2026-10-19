-- CreateTable
CREATE TABLE "notas_clinicas" (
    "id" SERIAL NOT NULL,
    "id_paciente" INTEGER NOT NULL,
    "conteudo" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_autor" INTEGER NOT NULL,

    CONSTRAINT "notas_clinicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notas_clinicas_id_paciente_idx" ON "notas_clinicas"("id_paciente");

-- CreateIndex
CREATE INDEX "notas_clinicas_id_autor_idx" ON "notas_clinicas"("id_autor");

-- CreateIndex
CREATE INDEX "pacientes_id_nutricionista_idx" ON "pacientes"("id_nutricionista");

-- AddForeignKey
ALTER TABLE "notas_clinicas" ADD CONSTRAINT "notas_clinicas_id_paciente_fkey" FOREIGN KEY ("id_paciente") REFERENCES "pacientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_clinicas" ADD CONSTRAINT "notas_clinicas_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
